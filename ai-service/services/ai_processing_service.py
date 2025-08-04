import asyncio
import time
from typing import Dict, Any, List, Optional, Union
from dataclasses import dataclass
import logging

from .whisper_service import WhisperService
from .llm_service import LLMService
from .knowledge_service import MemoryKnowledgeService

logger = logging.getLogger(__name__)

@dataclass
class ProcessingResult:
    """Unified processing result structure"""
    success: bool
    transcription: Optional[str] = None
    understanding: Dict[str, Any] = None
    actions: List[str] = None
    response_content: Optional[str] = None  # 添加生成的回答内容
    processing_time: float = 0.0
    timestamp: str = ""
    error: Optional[str] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.understanding is None:
            self.understanding = {}
        if self.actions is None:
            self.actions = []
        if self.metadata is None:
            self.metadata = {}

class AIProcessingService:
    """Unified AI processing service that integrates all AI components"""
    
    def __init__(self, whisper_service: WhisperService, llm_service: LLMService, 
                 knowledge_service: MemoryKnowledgeService):
        self.whisper_service = whisper_service
        self.llm_service = llm_service
        self.knowledge_service = knowledge_service
        self._processing_stats = {
            'total_requests': 0,
            'successful_requests': 0,
            'failed_requests': 0,
            'average_processing_time': 0.0
        }
    
    def is_ready(self) -> bool:
        """Check if all required services are ready"""
        return (
            self.whisper_service.is_loaded() and
            self.llm_service.is_loaded() and
            self.knowledge_service.is_ready()
        )
    
    async def process_voice(self, audio_data: bytes, language: Optional[str] = None) -> ProcessingResult:
        """Process voice input through the complete AI pipeline"""
        start_time = time.time()
        self._processing_stats['total_requests'] += 1
        
        try:
            logger.info("Starting voice processing pipeline")
            
            # Validate services
            if not self.is_ready():
                raise RuntimeError("AI services not ready")
            
            # Step 1: Speech-to-text
            logger.info("Step 1: Speech-to-text conversion")
            transcription_result = await self.whisper_service.transcribe(audio_data, language)
            transcribed_text = transcription_result["text"]
            
            if not transcribed_text.strip():
                logger.warning("Transcription resulted in empty text")
                return ProcessingResult(
                    success=False,
                    error="No speech detected in audio",
                    processing_time=time.time() - start_time,
                    timestamp=str(time.time())
                )
            
            logger.info(f"Transcription completed: '{transcribed_text[:100]}{'...' if len(transcribed_text) > 100 else ''}'")
            
            # Step 2: Text understanding
            logger.info("Step 2: Text understanding")
            understanding = await self.llm_service.understand(transcribed_text)
            
            # Step 3: Knowledge retrieval
            logger.info("Step 3: Knowledge base search")
            context = await self._search_knowledge_context(transcribed_text, understanding)
            
            # Step 4: Decision generation
            logger.info("Step 4: Decision generation")
            decision = await self.llm_service.decide(understanding, context)
            
            processing_time = time.time() - start_time
            self._processing_stats['successful_requests'] += 1
            self._update_average_processing_time(processing_time)
            
            logger.info(f"Voice processing completed successfully in {processing_time:.2f}s")
            
            return ProcessingResult(
                success=True,
                transcription=transcribed_text,
                understanding=understanding,
                actions=decision.get("actions", []),
                processing_time=processing_time,
                timestamp=str(time.time()),
                metadata={
                    'transcription_confidence': transcription_result.get("confidence", 0.0),
                    'language': transcription_result.get("language", "unknown"),
                    'decision_confidence': decision.get("confidence", 0.0),
                    'context_documents': len(context),
                    'processing_steps': ['transcription', 'understanding', 'knowledge_search', 'decision']
                }
            )
            
        except Exception as e:
            processing_time = time.time() - start_time
            self._processing_stats['failed_requests'] += 1
            logger.error(f"Voice processing failed: {e}")
            
            return ProcessingResult(
                success=False,
                error=str(e),
                processing_time=processing_time,
                timestamp=str(time.time())
            ) 
   
    async def process_text(self, text: str) -> ProcessingResult:
        """Process text input through the AI pipeline"""
        start_time = time.time()
        self._processing_stats['total_requests'] += 1
        
        try:
            logger.info("Starting text processing pipeline")
            
            # Validate services
            if not self.llm_service.is_loaded():
                raise RuntimeError("LLM service not ready")
            
            # Validate input
            if not text or not text.strip():
                raise ValueError("Empty text input")
            
            text = text.strip()
            logger.info(f"Processing text: '{text[:100]}{'...' if len(text) > 100 else ''}'")
            
            # Step 1: Text understanding
            step1_start = time.time()
            logger.info("Step 1: Text understanding")
            understanding = await self.llm_service.understand(text)
            step1_time = time.time() - step1_start
            logger.info(f"Step 1 completed in {step1_time:.2f}s")
            
            # Step 2: Knowledge retrieval
            step2_start = time.time()
            logger.info("Step 2: Knowledge base search")
            context = await self._search_knowledge_context(text, understanding)
            step2_time = time.time() - step2_start
            logger.info(f"Step 2 completed in {step2_time:.2f}s")
            
            # Step 3: Content generation
            step3_start = time.time()
            logger.info("Step 3: Content generation")
            response_content = await self.llm_service.generate_response(text, understanding, context)
            step3_time = time.time() - step3_start
            logger.info(f"Step 3 completed in {step3_time:.2f}s")
            
            # Step 4: Decision generation (simplified)
            step4_start = time.time()
            logger.info("Step 4: Decision generation")
            decision = await self.llm_service.decide(understanding, context)
            step4_time = time.time() - step4_start
            logger.info(f"Step 4 completed in {step4_time:.2f}s")
            
            processing_time = time.time() - start_time
            self._processing_stats['successful_requests'] += 1
            self._update_average_processing_time(processing_time)
            
            logger.info(f"Text processing completed successfully in {processing_time:.2f}s")
            
            return ProcessingResult(
                success=True,
                understanding=understanding,
                actions=decision.get("actions", []),
                response_content=response_content,  # 将生成的内容放在主字段中
                processing_time=processing_time,
                timestamp=str(time.time()),
                metadata={
                    'input_length': len(text),
                    'decision_confidence': decision.get("confidence", 0.0),
                    'context_documents': len(context),
                    'processing_steps': ['understanding', 'knowledge_search', 'content_generation', 'decision'],
                    'response_length': len(response_content)
                }
            )
            
        except Exception as e:
            processing_time = time.time() - start_time
            self._processing_stats['failed_requests'] += 1
            logger.error(f"Text processing failed: {e}")
            
            return ProcessingResult(
                success=False,
                error=str(e),
                processing_time=processing_time,
                timestamp=str(time.time())
            )
    
    async def _search_knowledge_context(self, text: str, understanding: Dict[str, Any]) -> List[str]:
        """Search for relevant knowledge context"""
        context = []
        
        try:
            if not self.knowledge_service.is_ready():
                logger.warning("Knowledge service not ready, skipping context search")
                return context
            
            # Create search query from text and understanding
            search_queries = [text]
            
            # Add intent-based search if available
            intent = understanding.get('intent')
            if intent and intent != 'general_query':
                search_queries.append(intent)
            
            # Add entities to search if available
            entities = understanding.get('entities', [])
            if entities:
                search_queries.extend(entities[:3])  # Limit to top 3 entities
            
            # Search for each query and collect unique results
            seen_content = set()
            for query in search_queries:
                try:
                    results = await self.knowledge_service.search(query, max_results=2)
                    for result in results:
                        content = result.document.content
                        if content not in seen_content and len(content.strip()) > 20:
                            context.append(content)
                            seen_content.add(content)
                            
                            # Limit total context to avoid overwhelming the LLM
                            if len(context) >= 3:
                                break
                    
                    if len(context) >= 3:
                        break
                        
                except Exception as e:
                    logger.warning(f"Knowledge search failed for query '{query}': {e}")
                    continue
            
            logger.info(f"Found {len(context)} relevant knowledge documents")
            
        except Exception as e:
            logger.error(f"Knowledge context search failed: {e}")
        
        return context
    
    def _update_average_processing_time(self, processing_time: float):
        """Update average processing time statistics"""
        try:
            total_successful = self._processing_stats['successful_requests']
            current_avg = self._processing_stats['average_processing_time']
            
            # Calculate new average
            new_avg = ((current_avg * (total_successful - 1)) + processing_time) / total_successful
            self._processing_stats['average_processing_time'] = new_avg
            
        except Exception as e:
            logger.warning(f"Failed to update processing time statistics: {e}")
    
    async def get_processing_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        try:
            stats = self._processing_stats.copy()
            
            # Add success rate
            total = stats['total_requests']
            if total > 0:
                stats['success_rate'] = stats['successful_requests'] / total
                stats['failure_rate'] = stats['failed_requests'] / total
            else:
                stats['success_rate'] = 0.0
                stats['failure_rate'] = 0.0
            
            # Add service status
            stats['services_ready'] = self.is_ready()
            stats['service_status'] = {
                'whisper': self.whisper_service.is_loaded(),
                'llm': self.llm_service.is_loaded(),
                'knowledge': self.knowledge_service.is_ready()
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"Failed to get processing statistics: {e}")
            return {}
    
    async def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check for all services"""
        try:
            health_status = {
                'overall_status': 'healthy' if self.is_ready() else 'unhealthy',
                'services': {
                    'whisper': {
                        'status': 'ready' if self.whisper_service.is_loaded() else 'not_ready',
                        'model': self.whisper_service.model_name
                    },
                    'llm': {
                        'status': 'ready' if self.llm_service.is_loaded() else 'not_ready',
                        'model': self.llm_service.model_name
                    },
                    'knowledge': {
                        'status': 'ready' if self.knowledge_service.is_ready() else 'not_ready',
                        'documents': len(self.knowledge_service.documents) if self.knowledge_service.is_ready() else 0
                    }
                },
                'statistics': await self.get_processing_stats(),
                'timestamp': str(time.time())
            }
            
            return health_status
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {
                'overall_status': 'error',
                'error': str(e),
                'timestamp': str(time.time())
            }
    
    async def process_batch(self, inputs: List[Dict[str, Any]]) -> List[ProcessingResult]:
        """Process multiple inputs in batch"""
        try:
            logger.info(f"Starting batch processing for {len(inputs)} items")
            
            results = []
            for i, input_data in enumerate(inputs):
                try:
                    input_type = input_data.get('type')
                    
                    if input_type == 'voice':
                        audio_data = input_data.get('audio_data')
                        language = input_data.get('language')
                        result = await self.process_voice(audio_data, language)
                    elif input_type == 'text':
                        text = input_data.get('text')
                        result = await self.process_text(text)
                    else:
                        result = ProcessingResult(
                            success=False,
                            error=f"Unknown input type: {input_type}",
                            timestamp=str(time.time())
                        )
                    
                    results.append(result)
                    logger.info(f"Batch item {i+1}/{len(inputs)} processed: {'success' if result.success else 'failed'}")
                    
                except Exception as e:
                    logger.error(f"Batch item {i+1} failed: {e}")
                    results.append(ProcessingResult(
                        success=False,
                        error=str(e),
                        timestamp=str(time.time())
                    ))
            
            successful = sum(1 for r in results if r.success)
            logger.info(f"Batch processing completed: {successful}/{len(inputs)} successful")
            
            return results
            
        except Exception as e:
            logger.error(f"Batch processing failed: {e}")
            return [ProcessingResult(
                success=False,
                error=str(e),
                timestamp=str(time.time())
            )]