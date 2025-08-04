import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, pipeline, GenerationConfig
from typing import Dict, Any, List, Optional, Union
from config.settings import settings
import logging
import json
import asyncio
import time
import re
from functools import wraps
import os

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

class LLMService:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.pipeline = None
        self.generation_config = None
        self.model_name = settings.LLM_MODEL
        self.device = settings.DEVICE
        self._loaded = False
        self._loading = False
        self._model_cache_dir = os.path.join(os.getcwd(), "models", "llm")
        
        # Inference parameters for lightweight model - optimized for speed
        self.inference_params = {
            "max_new_tokens": 128,  # Reduced from 512 for faster generation
            "temperature": 0.3,     # Lower temperature for more focused responses
            "top_p": 0.8,          # Slightly more focused
            "top_k": 20,           # Reduced for faster sampling
            "repetition_penalty": 1.05,  # Slightly reduced
            "do_sample": True,
            "pad_token_id": None,  # Will be set after tokenizer loading
        }
    
    async def load_model(self):
        """Load the language model with optimization for Qwen2-1.5B"""
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
            logger.info(f"Loading LLM model: {self.model_name} on device: {self.device}")
            start_time = time.time()
            
            # Create model cache directory
            os.makedirs(self._model_cache_dir, exist_ok=True)
            
            # Load tokenizer with optimizations
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_name,
                trust_remote_code=True,
                cache_dir=self._model_cache_dir,
                use_fast=True  # Use fast tokenizer if available
            )
            
            # Set pad token if not exists
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
            
            # Update inference parameters with tokenizer info
            self.inference_params["pad_token_id"] = self.tokenizer.pad_token_id
            
            # Load model with optimizations for lightweight deployment
            model_kwargs = {
                "trust_remote_code": True,
                "cache_dir": self._model_cache_dir,
                "low_cpu_mem_usage": True,
            }
            
            # Configure for device
            if self.device != "cpu":
                model_kwargs.update({
                    "torch_dtype": torch.float16,
                    "device_map": "auto",
                })
            else:
                model_kwargs.update({
                    "torch_dtype": torch.float32,
                })
            
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                **model_kwargs
            )
            
            # Optimize model for inference
            self.model.eval()
            if hasattr(self.model, 'generation_config'):
                self.generation_config = self.model.generation_config
                self.generation_config.update(**self.inference_params)
            
            # Create optimized pipeline
            self.pipeline = pipeline(
                "text-generation",
                model=self.model,
                tokenizer=self.tokenizer,
                device=0 if self.device != "cpu" else -1,
                return_full_text=False,  # Only return generated text
                clean_up_tokenization_spaces=True
            )
            
            # Warm up the model
            await self._warmup_model()
            
            load_time = time.time() - start_time
            self._loaded = True
            logger.info(f"LLM model loaded successfully in {load_time:.2f}s")
            
        except Exception as e:
            logger.error(f"Failed to load LLM model: {e}")
            raise
        finally:
            self._loading = False
    
    async def _warmup_model(self):
        """Warm up the model with a simple prompt"""
        try:
            logger.info("Warming up LLM model...")
            warmup_prompt = "Hello, this is a test."
            
            # Run a simple generation to warm up
            result = self.pipeline(
                warmup_prompt,
                max_new_tokens=10,
                temperature=0.7,
                do_sample=False,
                pad_token_id=self.tokenizer.pad_token_id
            )
            
            logger.info("LLM model warmup completed")
            
        except Exception as e:
            logger.warning(f"Model warmup failed: {e}")
            # Don't fail the entire loading process if warmup fails
    
    def is_loaded(self) -> bool:
        """Check if model is loaded"""
        return self._loaded and self.model is not None
    
    @retry_on_failure(max_retries=3, delay=1.0)
    async def understand(self, text: str) -> Dict[str, Any]:
        """Understand the intent and extract entities from text with validation"""
        if not self.is_loaded():
            raise RuntimeError("LLM model not loaded")
        
        # Input validation
        if not text or not text.strip():
            raise ValueError("Empty text input")
        
        if len(text) > 2000:  # Limit input length for lightweight model
            logger.warning(f"Input text too long ({len(text)} chars), truncating to 2000")
            text = text[:2000] + "..."
        
        try:
            logger.info(f"Understanding text: {text[:100]}{'...' if len(text) > 100 else ''}")
            
            prompt = self._create_understanding_prompt(text)
            response = await self._generate_response(prompt, max_new_tokens=256)
            
            # Parse and validate the response
            understanding = self._parse_understanding_response(response, text)
            
            # Validate the understanding result
            understanding = self._validate_understanding(understanding, text)
            
            logger.info(f"Understanding completed: intent={understanding.get('intent')}, confidence={understanding.get('confidence')}")
            
            return understanding
            
        except Exception as e:
            logger.error(f"Text understanding failed: {e}")
            raise
    
    async def generate_response(self, text: str, understanding: Dict[str, Any], context: Optional[List[str]] = None) -> str:
        """Generate actual response content for the user"""
        try:
            intent = understanding.get('intent', 'unknown')
            logger.info(f"Generating response for intent: {intent}")
            
            # Use rule-based responses for better reliability and speed
            response = self._get_rule_based_response(text, understanding)
            
            logger.info(f"Response generated: {len(response)} characters")
            return response
            
        except Exception as e:
            logger.error(f"Response generation failed: {e}")
            # Return a fallback response
            return self._get_fallback_response(understanding.get('intent', 'unknown'))

    @retry_on_failure(max_retries=3, delay=1.0)
    async def decide(self, understanding: Dict[str, Any], context: Optional[List[str]] = None) -> Dict[str, Any]:
        """Generate decisions and actions based on understanding and context with validation"""
        if not self.is_loaded():
            raise RuntimeError("LLM model not loaded")
        
        # Validate understanding input
        if not understanding or not isinstance(understanding, dict):
            raise ValueError("Invalid understanding input")
        
        try:
            logger.info(f"Generating decision for intent: {understanding.get('intent', 'unknown')}")
            
            prompt = self._create_decision_prompt(understanding, context)
            response = await self._generate_response(prompt, max_new_tokens=64)
            
            # Parse and validate the response
            decision = self._parse_decision_response(response, understanding)
            
            # Validate the decision result
            decision = self._validate_decision(decision, understanding)
            
            logger.info(f"Decision generated: {len(decision.get('actions', []))} actions, priority={decision.get('priority')}")
            
            return decision
            
        except Exception as e:
            logger.error(f"Decision generation failed: {e}")
            raise
    
    async def _generate_response(self, prompt: str, max_new_tokens: int = 128) -> str:
        """Generate response using the language model with optimized parameters"""
        try:
            # Validate prompt length - more aggressive truncation
            if len(prompt) > 800:  # Reduced from 1500 for faster processing
                logger.warning(f"Prompt too long ({len(prompt)} chars), truncating")
                prompt = prompt[:800] + "..."
            
            # Use asyncio timeout to prevent hanging
            async def generate_with_timeout():
                return await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.pipeline(
                        prompt,
                        max_new_tokens=min(max_new_tokens, 32),  # Further reduced to 32 tokens
                        temperature=0.1,  # Very low temperature for consistent, fast responses
                        top_p=0.7,
                        top_k=10,  # Very focused sampling
                        repetition_penalty=1.02,
                        do_sample=False,  # Greedy decoding for speed
                        pad_token_id=self.inference_params["pad_token_id"],
                        eos_token_id=self.tokenizer.eos_token_id,
                        return_full_text=False,  # Only return generated text
                        clean_up_tokenization_spaces=True
                    )
                )
            
            # Set timeout to 15 seconds
            response = await asyncio.wait_for(generate_with_timeout(), timeout=15.0)
            
            # Extract generated text
            if isinstance(response, list) and len(response) > 0:
                generated_text = response[0].get('generated_text', '').strip()
            else:
                generated_text = str(response).strip()
            
            # Clean up the response
            generated_text = self._clean_generated_text(generated_text)
            
            if not generated_text:
                logger.warning("Generated empty response")
                return "{}"  # Return empty JSON as fallback
            
            return generated_text
            
        except Exception as e:
            logger.error(f"Response generation failed: {e}")
            raise
    
    def _clean_generated_text(self, text: str) -> str:
        """Clean up generated text"""
        try:
            # Remove common artifacts
            text = text.strip()
            
            # Remove repeated newlines
            text = re.sub(r'\n\s*\n', '\n', text)
            
            # Remove incomplete sentences at the end
            if text and not text.endswith(('.', '!', '?', '}', ']')):
                # Find the last complete sentence
                last_punct = max(
                    text.rfind('.'),
                    text.rfind('!'),
                    text.rfind('?'),
                    text.rfind('}'),
                    text.rfind(']')
                )
                if last_punct > len(text) * 0.5:  # Only if we're not cutting too much
                    text = text[:last_punct + 1]
            
            return text
            
        except Exception as e:
            logger.warning(f"Text cleaning failed: {e}")
            return text
    
    def _create_understanding_prompt(self, text: str) -> str:
        """Create prompt for text understanding"""
        return f"""Analyze: {text}

JSON response:
{{"intent": "greeting/question/request/command/general_query", "entities": [], "sentiment": "positive/negative/neutral", "confidence": 0.8, "summary": "brief summary"}}"""
    
    def _create_response_prompt(self, text: str, understanding: Dict[str, Any], context: Optional[List[str]] = None) -> str:
        """Create prompt for generating actual response content"""
        intent = understanding.get('intent', 'unknown')
        
        # Create different prompts based on intent - more direct and specific
        if "笑话" in text or "joke" in text.lower():
            return "讲笑话：小明问老师：'老师，为什么我的作业本上总是有红叉叉？'老师说：'因为你的答案都是错的。'小明说：'那为什么不用绿色的勾勾呢？'"
        elif "故事" in text or "story" in text.lower():
            return "讲故事：从前有一只小兔子，它很喜欢胡萝卜。有一天，它发现了一个巨大的胡萝卜田，高兴得跳了起来。但是田里有一个稻草人，小兔子很害怕。后来它发现稻草人其实很友善，还和它分享了最甜的胡萝卜。"
        elif "天气" in text or "weather" in text.lower():
            return "很抱歉，我无法获取实时天气信息。建议您查看天气预报应用或网站获取准确的天气信息。"
        elif intent == "greeting":
            return "您好！很高兴与您交流。我是AI助手，可以为您讲故事、说笑话或回答问题。有什么我可以帮助您的吗？"
        else:
            return f"我理解您的问题。关于'{text}'，我会尽力为您提供帮助和信息。"

    def _create_decision_prompt(self, understanding: Dict[str, Any], context: Optional[List[str]] = None) -> str:
        """Create prompt for decision generation"""
        intent = understanding.get('intent', 'unknown')
        sentiment = understanding.get('sentiment', 'neutral')
        
        return f"""Intent: {intent}, Sentiment: {sentiment}

JSON response:
{{"actions": ["provide_information"], "priority": "medium", "reasoning": "brief explanation", "next_steps": ["await_user_input"], "confidence": 0.8}}"""

    def _clean_response_content(self, response: str) -> str:
        """Clean and format the response content"""
        try:
            # Remove common artifacts and clean up
            response = response.strip()
            
            # Remove any JSON-like structures that might have leaked in
            response = re.sub(r'\{[^}]*\}', '', response)
            
            # Remove repeated phrases
            lines = response.split('\n')
            clean_lines = []
            for line in lines:
                line = line.strip()
                if line and line not in clean_lines:
                    clean_lines.append(line)
            
            response = '\n'.join(clean_lines)
            
            # Ensure it's not too long
            if len(response) > 500:
                response = response[:500] + "..."
            
            return response.strip()
            
        except Exception as e:
            logger.warning(f"Response cleaning failed: {e}")
            return response

    def _get_rule_based_response(self, text: str, understanding: Dict[str, Any]) -> str:
        """Generate rule-based responses for better reliability and speed"""
        text_lower = text.lower()
        intent = understanding.get('intent', 'unknown')
        
        # 笑话相关
        if "笑话" in text or "joke" in text_lower:
            jokes = [
                "小明问老师：'老师，为什么我的作业本上总是有红叉叉？'老师说：'因为你的答案都是错的。'小明说：'那为什么不用绿色的勾勾呢？'",
                "老师问：'小明，你知道什么是勇敢吗？'小明说：'知道，就是明知道会被妈妈打，还要把花瓶打碎。'",
                "小红问小明：'你知道什么动物最容易摔倒吗？'小明说：'不知道。'小红说：'是狐狸，因为它狡猾（脚滑）！'",
                "为什么数学书总是比物理书厚？因为数学书里有无数个'0'！"
            ]
            import random
            return random.choice(jokes)
        
        # 故事相关
        elif "故事" in text or "story" in text_lower:
            stories = [
                "从前有一只小兔子，它很喜欢胡萝卜。有一天，它发现了一个巨大的胡萝卜田，高兴得跳了起来。但是田里有一个稻草人，小兔子很害怕。后来它发现稻草人其实很友善，还和它分享了最甜的胡萝卜。从此，小兔子和稻草人成了好朋友。",
                "有一只小猫咪叫咪咪，它总是很好奇。一天，咪咪看到一只蝴蝶在花园里飞舞，就跟着蝴蝶跑。蝴蝶带着咪咪穿过了整个花园，最后停在了一朵美丽的向日葵上。咪咪这才发现，原来花园里有这么多美丽的花朵！",
                "小熊维尼住在森林里，它最喜欢吃蜂蜜。有一天，维尼发现蜂蜜罐空了，就去找蜜蜂朋友帮忙。蜜蜂说：'维尼，如果你帮我们采花粉，我们就给你蜂蜜。'维尼高兴地答应了，从此它学会了勤劳工作的快乐。"
            ]
            import random
            return random.choice(stories)
        
        # 天气相关
        elif "天气" in text or "weather" in text_lower:
            return "很抱歉，我无法获取实时天气信息。建议您查看天气预报应用或网站获取准确的天气信息。您也可以问我其他问题，比如让我讲个故事或笑话！"
        
        # 问候相关
        elif intent == "greeting" or any(word in text_lower for word in ["你好", "hello", "hi", "早上好", "晚上好"]):
            greetings = [
                "您好！很高兴与您交流。我是AI助手，可以为您讲故事、说笑话或回答问题。有什么我可以帮助您的吗？",
                "你好！我是您的AI助手，很高兴见到您！我可以给您讲笑话、讲故事，或者聊聊天。您想听什么呢？",
                "嗨！欢迎来聊天！我可以为您提供各种有趣的内容，比如笑话、故事，或者回答您的问题。"
            ]
            import random
            return random.choice(greetings)
        
        # 感谢相关
        elif any(word in text_lower for word in ["谢谢", "thank", "感谢"]):
            return "不客气！很高兴能帮助您。如果您还有其他问题或想听更多故事、笑话，随时告诉我哦！"
        
        # 帮助相关
        elif any(word in text_lower for word in ["帮助", "help", "怎么", "如何"]):
            return "我很乐意帮助您！我可以：\n1. 给您讲有趣的笑话\n2. 讲简短的小故事\n3. 进行简单的对话交流\n4. 回答一些基本问题\n\n您想要我做什么呢？"
        
        # 能力询问
        elif any(word in text_lower for word in ["你会", "你能", "can you", "你可以"]):
            return "我可以为您做很多事情！比如：\n• 讲笑话让您开心\n• 讲故事给您听\n• 和您聊天交流\n• 回答一些简单的问题\n\n您想要尝试哪一个呢？"
        
        # 默认回应
        else:
            default_responses = [
                f"我理解您说的是：{text}。虽然我可能无法给出完美的回答，但我很乐意和您聊天！您可以让我讲个笑话或故事。",
                f"关于'{text}'，我会尽力为您提供帮助。不过我最擅长的是讲笑话和故事，要不要试试？",
                f"感谢您的输入！虽然我对'{text}'了解有限，但我可以为您讲个有趣的故事或笑话来让您开心！"
            ]
            import random
            return random.choice(default_responses)

    def _get_fallback_response(self, intent: str) -> str:
        """Get fallback response based on intent"""
        fallback_responses = {
            "question": "我理解您的问题，但目前无法提供详细回答。请尝试重新表述您的问题。",
            "request": "我收到了您的请求，正在处理中。请稍等片刻。",
            "greeting": "您好！很高兴与您交流。有什么我可以帮助您的吗？",
            "command": "我理解您的指令，但需要更多信息才能执行。",
            "general_query": "感谢您的输入。我正在学习如何更好地回应您的需求。"
        }
        
        return fallback_responses.get(intent, "谢谢您的输入，我会尽力帮助您。")
    
    def _parse_understanding_response(self, response: str, original_text: str) -> Dict[str, Any]:
        """Parse the understanding response with enhanced validation"""
        try:
            # Try to extract JSON from the response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            
            if json_start != -1 and json_end != -1:
                json_str = response[json_start:json_end]
                parsed = json.loads(json_str)
                
                # Ensure all required fields exist
                result = {
                    "intent": parsed.get("intent", "general_query"),
                    "entities": parsed.get("entities", []),
                    "sentiment": parsed.get("sentiment", "neutral"),
                    "confidence": float(parsed.get("confidence", 0.5)),
                    "summary": parsed.get("summary", original_text[:100] + "..." if len(original_text) > 100 else original_text)
                }
                
                # Validate field types and values
                if not isinstance(result["entities"], list):
                    result["entities"] = []
                
                if result["sentiment"] not in ["positive", "negative", "neutral"]:
                    result["sentiment"] = "neutral"
                
                result["confidence"] = max(0.0, min(1.0, result["confidence"]))
                
                return result
            else:
                # Fallback parsing
                return self._create_fallback_understanding(response, original_text)
                
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.warning(f"Failed to parse understanding response as JSON: {e}")
            return self._create_fallback_understanding(response, original_text)
    
    def _create_fallback_understanding(self, response: str, original_text: str) -> Dict[str, Any]:
        """Create fallback understanding when parsing fails"""
        # Try to extract intent from response text
        intent = "general_query"
        if any(word in response.lower() for word in ["question", "ask", "query"]):
            intent = "question"
        elif any(word in response.lower() for word in ["request", "want", "need"]):
            intent = "request"
        elif any(word in response.lower() for word in ["command", "do", "execute"]):
            intent = "command"
        
        return {
            "intent": intent,
            "entities": [],
            "sentiment": "neutral",
            "confidence": 0.4,  # Lower confidence for fallback
            "summary": original_text[:100] + "..." if len(original_text) > 100 else original_text
        }
    
    def _parse_decision_response(self, response: str, understanding: Dict[str, Any]) -> Dict[str, Any]:
        """Parse the decision response with enhanced validation"""
        try:
            # Try to extract JSON from the response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            
            if json_start != -1 and json_end != -1:
                json_str = response[json_start:json_end]
                parsed = json.loads(json_str)
                
                # Ensure all required fields exist
                result = {
                    "actions": parsed.get("actions", ["review_request"]),
                    "priority": parsed.get("priority", "medium"),
                    "reasoning": parsed.get("reasoning", "Generated decision based on understanding"),
                    "next_steps": parsed.get("next_steps", ["await_user_input"]),
                    "confidence": float(parsed.get("confidence", 0.5))
                }
                
                # Validate field types and values
                if not isinstance(result["actions"], list):
                    result["actions"] = ["review_request"]
                
                if result["priority"] not in ["high", "medium", "low"]:
                    result["priority"] = "medium"
                
                if not isinstance(result["next_steps"], list):
                    result["next_steps"] = ["await_user_input"]
                
                result["confidence"] = max(0.0, min(1.0, result["confidence"]))
                
                return result
            else:
                # Fallback parsing
                return self._create_fallback_decision(response, understanding)
                
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            logger.warning(f"Failed to parse decision response as JSON: {e}")
            return self._create_fallback_decision(response, understanding)
    
    def _create_fallback_decision(self, response: str, understanding: Dict[str, Any]) -> Dict[str, Any]:
        """Create fallback decision when parsing fails"""
        # Determine priority based on intent
        intent = understanding.get("intent", "general_query")
        priority = "medium"
        
        if intent in ["urgent", "emergency", "critical"]:
            priority = "high"
        elif intent in ["info", "question", "general_query"]:
            priority = "low"
        
        # Generate basic actions based on intent
        actions = ["review_request"]
        if intent == "question":
            actions = ["provide_information", "research_topic"]
        elif intent == "request":
            actions = ["process_request", "gather_requirements"]
        elif intent == "command":
            actions = ["execute_command", "verify_permissions"]
        
        return {
            "actions": actions,
            "priority": priority,
            "reasoning": response[:200] + "..." if len(response) > 200 else response,
            "next_steps": ["await_user_input"],
            "confidence": 0.4  # Lower confidence for fallback
        }
    
    def _validate_understanding(self, understanding: Dict[str, Any], original_text: str) -> Dict[str, Any]:
        """Validate and enhance understanding result"""
        try:
            # Ensure required fields
            validated = {
                "intent": understanding.get("intent", "general_query"),
                "entities": understanding.get("entities", []),
                "sentiment": understanding.get("sentiment", "neutral"),
                "confidence": understanding.get("confidence", 0.5),
                "summary": understanding.get("summary", original_text[:100] + "..." if len(original_text) > 100 else original_text)
            }
            
            # Validate intent categories
            valid_intents = [
                "question", "request", "command", "information", "greeting", 
                "complaint", "compliment", "general_query", "instruction", "clarification"
            ]
            
            if validated["intent"] not in valid_intents:
                # Try to map to valid intent
                intent_lower = validated["intent"].lower()
                if any(word in intent_lower for word in ["ask", "what", "how", "why", "when", "where"]):
                    validated["intent"] = "question"
                elif any(word in intent_lower for word in ["please", "can you", "would you", "need"]):
                    validated["intent"] = "request"
                elif any(word in intent_lower for word in ["do", "execute", "run", "start", "stop"]):
                    validated["intent"] = "command"
                else:
                    validated["intent"] = "general_query"
            
            # Validate entities list
            if not isinstance(validated["entities"], list):
                validated["entities"] = []
            
            # Clean and validate entities
            clean_entities = []
            for entity in validated["entities"]:
                if isinstance(entity, str) and entity.strip():
                    clean_entities.append(entity.strip())
                elif isinstance(entity, dict) and entity.get("text"):
                    clean_entities.append(entity["text"].strip())
            validated["entities"] = clean_entities[:10]  # Limit to 10 entities
            
            # Validate sentiment
            if validated["sentiment"] not in ["positive", "negative", "neutral"]:
                validated["sentiment"] = "neutral"
            
            # Validate confidence
            validated["confidence"] = max(0.0, min(1.0, float(validated["confidence"])))
            
            # Enhance confidence based on text characteristics
            if len(original_text.strip()) < 10:
                validated["confidence"] *= 0.8  # Lower confidence for very short text
            elif len(original_text.strip()) > 500:
                validated["confidence"] *= 0.9  # Slightly lower confidence for very long text
            
            return validated
            
        except Exception as e:
            logger.error(f"Understanding validation failed: {e}")
            return understanding
    
    def _validate_decision(self, decision: Dict[str, Any], understanding: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and enhance decision result"""
        try:
            # Ensure required fields
            validated = {
                "actions": decision.get("actions", ["review_request"]),
                "priority": decision.get("priority", "medium"),
                "reasoning": decision.get("reasoning", "Generated decision based on understanding"),
                "next_steps": decision.get("next_steps", ["await_user_input"]),
                "confidence": decision.get("confidence", 0.5)
            }
            
            # Validate actions list
            if not isinstance(validated["actions"], list) or not validated["actions"]:
                validated["actions"] = ["review_request"]
            
            # Clean and validate actions
            valid_actions = [
                "review_request", "provide_information", "execute_command", "research_topic",
                "process_request", "gather_requirements", "verify_permissions", "schedule_task",
                "send_notification", "update_status", "create_reminder", "search_knowledge",
                "await_user_input", "escalate_issue", "log_interaction"
            ]
            
            clean_actions = []
            for action in validated["actions"]:
                if isinstance(action, str) and action.strip():
                    action_clean = action.strip().lower().replace(" ", "_")
                    if action_clean in valid_actions:
                        clean_actions.append(action_clean)
                    else:
                        # Map similar actions
                        if any(word in action_clean for word in ["search", "find", "lookup"]):
                            clean_actions.append("search_knowledge")
                        elif any(word in action_clean for word in ["execute", "run", "perform"]):
                            clean_actions.append("execute_command")
                        elif any(word in action_clean for word in ["inform", "tell", "explain"]):
                            clean_actions.append("provide_information")
                        else:
                            clean_actions.append("review_request")
            
            validated["actions"] = clean_actions[:5] if clean_actions else ["review_request"]  # Limit to 5 actions
            
            # Validate priority
            if validated["priority"] not in ["high", "medium", "low"]:
                # Determine priority based on understanding
                intent = understanding.get("intent", "general_query")
                sentiment = understanding.get("sentiment", "neutral")
                
                if intent in ["command", "urgent"] or sentiment == "negative":
                    validated["priority"] = "high"
                elif intent in ["question", "information"]:
                    validated["priority"] = "low"
                else:
                    validated["priority"] = "medium"
            
            # Validate next_steps
            if not isinstance(validated["next_steps"], list) or not validated["next_steps"]:
                validated["next_steps"] = ["await_user_input"]
            
            # Clean next_steps
            clean_next_steps = []
            for step in validated["next_steps"]:
                if isinstance(step, str) and step.strip():
                    clean_next_steps.append(step.strip())
            validated["next_steps"] = clean_next_steps[:3] if clean_next_steps else ["await_user_input"]  # Limit to 3 steps
            
            # Validate confidence
            validated["confidence"] = max(0.0, min(1.0, float(validated["confidence"])))
            
            # Adjust confidence based on understanding confidence
            understanding_confidence = understanding.get("confidence", 0.5)
            validated["confidence"] = (validated["confidence"] + understanding_confidence) / 2
            
            # Ensure reasoning is not empty
            if not validated["reasoning"] or len(validated["reasoning"].strip()) < 10:
                validated["reasoning"] = f"Decision generated for {understanding.get('intent', 'general')} intent with {understanding.get('sentiment', 'neutral')} sentiment"
            
            return validated
            
        except Exception as e:
            logger.error(f"Decision validation failed: {e}")
            return decision