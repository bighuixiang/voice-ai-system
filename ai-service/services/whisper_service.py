import whisper
import torch
import numpy as np
import librosa
import io
import asyncio
import tempfile
import os
from typing import Optional, Dict, Any, Union
from config.settings import settings
import logging
from functools import wraps
import time

logger = logging.getLogger(__name__)

def retry_on_failure(max_retries: int = 3, delay: float = 1.0):
    """Decorator for retrying failed operations"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        logger.warning(f"Attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
                        await asyncio.sleep(delay * (2 ** attempt))  # Exponential backoff
                    else:
                        logger.error(f"All {max_retries} attempts failed")
            raise last_exception
        return wrapper
    return decorator

class WhisperService:
    def __init__(self):
        self.model = None
        self.model_name = settings.WHISPER_MODEL
        self.device = settings.DEVICE
        self._loaded = False
        self._loading = False
        self._model_cache_dir = os.path.join(os.getcwd(), "models", "whisper")
        self.supported_formats = settings.SUPPORTED_AUDIO_FORMATS
        self.max_audio_size = settings.MAX_AUDIO_SIZE
    
    async def load_model(self):
        """Load the Whisper model with optimization"""
        if self._loading:
            logger.info("Model is already being loaded, waiting...")
            while self._loading:
                await asyncio.sleep(0.1)
            return
        
        if self._loaded:
            logger.info("Model is already loaded")
            return
        
        self._loading = True
        try:
            logger.info(f"Loading Whisper model: {self.model_name} on device: {self.device}")
            
            # Create model cache directory if it doesn't exist
            os.makedirs(self._model_cache_dir, exist_ok=True)
            
            # Load model with optimizations
            start_time = time.time()
            self.model = whisper.load_model(
                self.model_name, 
                device=self.device,
                download_root=self._model_cache_dir
            )
            
            # Optimize model for inference
            if hasattr(self.model, 'eval'):
                self.model.eval()
            
            # Warm up the model with a small dummy input
            await self._warmup_model()
            
            load_time = time.time() - start_time
            self._loaded = True
            logger.info(f"Whisper model loaded successfully in {load_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise
        finally:
            self._loading = False
    
    async def _warmup_model(self):
        """Warm up the model with a dummy input"""
        try:
            # Create a small dummy audio array (1 second of silence)
            dummy_audio = np.zeros(16000, dtype=np.float32)
            
            # Run a quick transcription to warm up the model
            logger.info("Warming up Whisper model...")
            result = self.model.transcribe(dummy_audio, verbose=False)
            logger.info("Model warmup completed")
            
        except Exception as e:
            logger.warning(f"Model warmup failed: {e}")
            # Don't fail the entire loading process if warmup fails
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self._loaded and self.model is not None
    
    @retry_on_failure(max_retries=3, delay=1.0)
    async def transcribe(self, audio_data: bytes, language: Optional[str] = None) -> Dict[str, Any]:
        """Transcribe audio data to text with retry mechanism"""
        if not self.is_loaded():
            raise RuntimeError("Whisper model not loaded")
        
        # Validate audio data size
        if len(audio_data) > self.max_audio_size:
            raise ValueError(f"Audio file too large: {len(audio_data)} bytes (max: {self.max_audio_size})")
        
        if len(audio_data) == 0:
            raise ValueError("Empty audio data")
        
        try:
            # Preprocess and convert bytes to numpy array
            audio_array = await self._preprocess_audio(audio_data)
            
            # Validate audio array
            if len(audio_array) == 0:
                raise ValueError("Audio preprocessing resulted in empty array")
            
            # Transcribe using Whisper with optimized parameters
            logger.info(f"Starting transcription for audio of length {len(audio_array)/16000:.2f}s")
            
            result = self.model.transcribe(
                audio_array,
                language=language,
                task="transcribe",
                fp16=False if self.device == "cpu" else True,
                verbose=False,
                word_timestamps=True,
                condition_on_previous_text=False  # Better for short audio clips
            )
            
            # Process and validate result
            transcribed_text = result["text"].strip()
            if not transcribed_text:
                logger.warning("Transcription resulted in empty text")
            
            confidence = self._calculate_confidence(result["segments"])
            
            logger.info(f"Transcription completed. Text length: {len(transcribed_text)}, Confidence: {confidence:.2f}")
            
            return {
                "text": transcribed_text,
                "language": result["language"],
                "segments": result["segments"],
                "confidence": confidence,
                "duration": len(audio_array) / 16000,
                "processing_info": {
                    "model": self.model_name,
                    "device": self.device,
                    "sample_rate": 16000
                }
            }
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise
    
    async def _preprocess_audio(self, audio_data: bytes) -> np.ndarray:
        """Enhanced audio preprocessing with format conversion and normalization"""
        try:
            # Save audio data to temporary file for better format support
            with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as temp_file:
                temp_file.write(audio_data)
                temp_path = temp_file.name
            
            try:
                # Load audio with librosa (supports many formats)
                audio_array, original_sr = librosa.load(
                    temp_path,
                    sr=None,  # Keep original sample rate first
                    mono=True,
                    dtype=np.float32
                )
                
                logger.info(f"Loaded audio: duration={len(audio_array)/original_sr:.2f}s, sr={original_sr}Hz")
                
                # Resample to 16kHz if needed (Whisper requirement)
                if original_sr != 16000:
                    audio_array = librosa.resample(
                        audio_array, 
                        orig_sr=original_sr, 
                        target_sr=16000,
                        res_type='kaiser_best'
                    )
                    logger.info(f"Resampled audio from {original_sr}Hz to 16000Hz")
                
                # Audio preprocessing and normalization
                audio_array = self._normalize_audio(audio_array)
                
                # Trim silence from beginning and end
                audio_array, _ = librosa.effects.trim(
                    audio_array, 
                    top_db=20,  # Trim silence below -20dB
                    frame_length=2048,
                    hop_length=512
                )
                
                # Ensure minimum length (0.1 seconds)
                min_length = int(0.1 * 16000)
                if len(audio_array) < min_length:
                    logger.warning(f"Audio too short ({len(audio_array)/16000:.2f}s), padding to minimum length")
                    audio_array = np.pad(audio_array, (0, min_length - len(audio_array)), mode='constant')
                
                # Ensure maximum length (30 seconds for Whisper)
                max_length = int(30 * 16000)
                if len(audio_array) > max_length:
                    logger.warning(f"Audio too long ({len(audio_array)/16000:.2f}s), truncating to 30s")
                    audio_array = audio_array[:max_length]
                
                logger.info(f"Preprocessed audio: duration={len(audio_array)/16000:.2f}s")
                return audio_array
                
            finally:
                # Clean up temporary file
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
                    
        except Exception as e:
            logger.error(f"Audio preprocessing failed: {e}")
            raise
    
    def _normalize_audio(self, audio_array: np.ndarray) -> np.ndarray:
        """Normalize audio array"""
        try:
            # Remove DC offset
            audio_array = audio_array - np.mean(audio_array)
            
            # Normalize to [-1, 1] range
            max_val = np.max(np.abs(audio_array))
            if max_val > 0:
                audio_array = audio_array / max_val
            
            # Apply gentle compression to reduce dynamic range
            audio_array = np.tanh(audio_array * 0.9)
            
            return audio_array.astype(np.float32)
            
        except Exception as e:
            logger.error(f"Audio normalization failed: {e}")
            return audio_array
    
    def _calculate_confidence(self, segments: list) -> float:
        """Calculate confidence score based on segment analysis"""
        if not segments:
            return 0.0
        
        try:
            # Analyze segments to estimate confidence
            total_duration = 0
            weighted_confidence = 0
            
            for segment in segments:
                duration = segment.get('end', 0) - segment.get('start', 0)
                text = segment.get('text', '').strip()
                
                # Base confidence factors
                confidence = 0.8  # Base confidence
                
                # Adjust based on text characteristics
                if text:
                    # Longer segments tend to be more reliable
                    if duration > 2.0:
                        confidence += 0.1
                    elif duration < 0.5:
                        confidence -= 0.1
                    
                    # Check for repeated words (might indicate uncertainty)
                    words = text.lower().split()
                    if len(words) > 1:
                        unique_words = len(set(words))
                        repetition_ratio = unique_words / len(words)
                        if repetition_ratio < 0.7:  # High repetition
                            confidence -= 0.15
                    
                    # Check for very short words (might be noise)
                    avg_word_length = sum(len(word) for word in words) / len(words) if words else 0
                    if avg_word_length < 2:
                        confidence -= 0.1
                    
                    # Check for common filler words or unclear speech indicators
                    filler_words = {'um', 'uh', 'er', 'ah', 'hmm'}
                    filler_count = sum(1 for word in words if word.lower() in filler_words)
                    if filler_count > len(words) * 0.3:  # More than 30% filler words
                        confidence -= 0.2
                
                # Ensure confidence stays within bounds
                confidence = max(0.1, min(0.95, confidence))
                
                # Weight by duration
                weighted_confidence += confidence * duration
                total_duration += duration
            
            # Calculate weighted average
            if total_duration > 0:
                final_confidence = weighted_confidence / total_duration
            else:
                final_confidence = 0.5  # Default for edge cases
            
            # Apply final adjustments based on overall transcription
            if len(segments) == 1 and total_duration < 1.0:
                final_confidence *= 0.9  # Slightly reduce confidence for very short audio
            
            return round(final_confidence, 3)
            
        except Exception as e:
            logger.warning(f"Confidence calculation failed: {e}")
            return 0.75  # Fallback confidence
    
    @retry_on_failure(max_retries=2, delay=0.5)
    async def detect_language(self, audio_data: bytes) -> str:
        """Detect the language of the audio with retry mechanism"""
        if not self.is_loaded():
            raise RuntimeError("Whisper model not loaded")
        
        try:
            # Preprocess audio data
            audio_array = await self._preprocess_audio(audio_data)
            
            # Convert to tensor for language detection
            audio_tensor = torch.from_numpy(audio_array).float()
            if self.device != "cpu":
                audio_tensor = audio_tensor.to(self.device)
            
            # Use Whisper's language detection
            _, probs = self.model.detect_language(audio_tensor)
            detected_language = max(probs, key=probs.get)
            
            logger.info(f"Detected language: {detected_language} (confidence: {probs[detected_language]:.2f})")
            return detected_language
            
        except Exception as e:
            logger.error(f"Language detection failed: {e}")
            return "en"  # Default to English