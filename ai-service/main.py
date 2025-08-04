import asyncio
import uvicorn
import time
import json
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
from pydantic import BaseModel
from typing import Optional, List
from services.whisper_service import WhisperService
from services.llm_service import LLMService
from services.vector_service import VectorService
from services.knowledge_service import MemoryKnowledgeService
from services.ai_processing_service import AIProcessingService
from config.settings import settings
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global service instances
whisper_service = None
llm_service = None
vector_service = None
knowledge_service = None
ai_processing_service = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global whisper_service, llm_service, vector_service, knowledge_service, ai_processing_service
    
    print("Initializing AI services...")
    
    # Initialize individual services
    whisper_service = WhisperService()
    llm_service = LLMService()
    vector_service = VectorService()
    knowledge_service = MemoryKnowledgeService()
    
    # Load models and initialize services
    await whisper_service.load_model()
    await llm_service.load_model()
    await vector_service.initialize()
    await knowledge_service.initialize()
    
    # Initialize unified processing service
    ai_processing_service = AIProcessingService(
        whisper_service=whisper_service,
        llm_service=llm_service,
        knowledge_service=knowledge_service
    )
    
    print("AI services initialized successfully!")
    
    yield
    
    # Shutdown
    print("Shutting down AI services...")

app = FastAPI(
    title="Voice AI Decision System - AI Service",
    description="AI processing service for voice recognition and language understanding",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request models
class TextProcessRequest(BaseModel):
    content: str

class ProcessingResponse(BaseModel):
    success: bool
    transcription: Optional[str] = None
    understanding: dict
    actions: list
    response_content: Optional[str] = None  # 添加生成的回答内容字段
    processing_time: float
    timestamp: str
    error: Optional[str] = None

@app.get("/")
async def root():
    return {"message": "Voice AI Decision System - AI Service is running!"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "services": {
            "whisper": whisper_service.is_loaded() if whisper_service else False,
            "llm": llm_service.is_loaded() if llm_service else False,
            "vector_db": vector_service.is_ready() if vector_service else False,
            "knowledge": knowledge_service.is_ready() if knowledge_service else False,
        }
    }

@app.get("/models/status")
async def models_status():
    return {
        "whisper": {
            "loaded": whisper_service.is_loaded() if whisper_service else False,
            "model_name": whisper_service.model_name if whisper_service else None,
        },
        "llm": {
            "loaded": llm_service.is_loaded() if llm_service else False,
            "model_name": llm_service.model_name if llm_service else None,
        },
        "vector_db": {
            "ready": vector_service.is_ready() if vector_service else False,
            "collection_count": await vector_service.get_collection_count() if vector_service and vector_service.is_ready() else 0,
        }
    }

@app.post("/api/process/voice")
async def process_voice(file: UploadFile = File(...)):
    """Process voice file using unified AI processing pipeline"""
    try:
        # Validate file
        if not file.content_type or not file.content_type.startswith('audio/'):
            raise HTTPException(status_code=400, detail="Invalid audio file format")
        
        if not ai_processing_service or not ai_processing_service.is_ready():
            raise HTTPException(status_code=503, detail="AI processing service not available")
        
        # Read audio data
        audio_data = await file.read()
        
        # Process through unified pipeline
        result = await ai_processing_service.process_voice(audio_data)
        
        # Convert to API response format
        return ProcessingResponse(
            success=result.success,
            transcription=result.transcription,
            understanding=result.understanding,
            actions=result.actions,
            processing_time=result.processing_time,
            timestamp=result.timestamp,
            error=result.error
        )
        
    except Exception as e:
        logger.error(f"Voice processing endpoint failed: {e}")
        
        return ProcessingResponse(
            success=False,
            understanding={},
            actions=[],
            processing_time=0.0,
            timestamp=str(time.time()),
            error=str(e)
        )

@app.post("/api/process/text")
async def process_text(request: TextProcessRequest):
    """Process text input using unified AI processing pipeline"""
    try:
        if not ai_processing_service or not ai_processing_service.is_ready():
            raise HTTPException(status_code=503, detail="AI processing service not available")
        
        # Process through unified pipeline
        result = await ai_processing_service.process_text(request.content)
        
        # Convert to API response format
        return ProcessingResponse(
            success=result.success,
            transcription=result.transcription,
            understanding=result.understanding,
            actions=result.actions,
            response_content=result.response_content,  # 添加生成的回答内容
            processing_time=result.processing_time,
            timestamp=result.timestamp,
            error=result.error
        )
        
    except Exception as e:
        logger.error(f"Text processing endpoint failed: {e}")
        
        return ProcessingResponse(
            success=False,
            understanding={},
            actions=[],
            processing_time=0.0,
            timestamp=str(time.time()),
            error=str(e)
        )

@app.post("/api/process/text/stream")
async def process_text_stream(request: TextProcessRequest):
    """Process text input with streaming response using Server-Sent Events"""
    try:
        if not ai_processing_service or not ai_processing_service.is_ready():
            raise HTTPException(status_code=503, detail="AI processing service not available")
        
        async def generate_stream():
            """Generate Server-Sent Events stream"""
            try:
                async for chunk in ai_processing_service.process_text_stream(request.content):
                    # Format as Server-Sent Events
                    chunk_json = f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
                    yield chunk_json.encode('utf-8')
                
                # Send completion marker
                yield "data: [DONE]\n\n".encode('utf-8')
                
            except Exception as e:
                logger.error(f"Stream generation failed: {e}")
                error_chunk = {
                    "type": "error",
                    "data": {"message": str(e)},
                    "timestamp": str(time.time())
                }
                yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n".encode('utf-8')
                yield "data: [DONE]\n\n".encode('utf-8')
        
        return StreamingResponse(
            generate_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "*"
            }
        )
        
    except Exception as e:
        logger.error(f"Streaming text processing endpoint failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Knowledge base management endpoints
class KnowledgeSearchRequest(BaseModel):
    query: str
    max_results: Optional[int] = 5

class KnowledgeAddRequest(BaseModel):
    title: str
    content: str
    metadata: Optional[dict] = None

@app.post("/api/knowledge/search")
async def search_knowledge(request: KnowledgeSearchRequest):
    """Search the knowledge base"""
    try:
        if not knowledge_service or not knowledge_service.is_ready():
            raise HTTPException(status_code=503, detail="Knowledge service not available")
        
        results = await knowledge_service.search(request.query, request.max_results)
        
        return {
            "success": True,
            "query": request.query,
            "results": [result.to_dict() for result in results],
            "total_found": len(results)
        }
        
    except Exception as e:
        logger.error(f"Knowledge search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/knowledge/add")
async def add_knowledge(request: KnowledgeAddRequest):
    """Add a document to the knowledge base"""
    try:
        if not knowledge_service or not knowledge_service.is_ready():
            raise HTTPException(status_code=503, detail="Knowledge service not available")
        
        doc_id = await knowledge_service.add_document(
            request.title, 
            request.content, 
            request.metadata
        )
        
        return {
            "success": True,
            "document_id": doc_id,
            "message": f"Document '{request.title}' added successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to add knowledge document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge/stats")
async def get_knowledge_stats():
    """Get knowledge base statistics"""
    try:
        if not knowledge_service or not knowledge_service.is_ready():
            raise HTTPException(status_code=503, detail="Knowledge service not available")
        
        stats = await knowledge_service.get_statistics()
        return {
            "success": True,
            "statistics": stats
        }
        
    except Exception as e:
        logger.error(f"Failed to get knowledge statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/knowledge/documents")
async def list_knowledge_documents(limit: Optional[int] = 50):
    """List knowledge base documents"""
    try:
        if not knowledge_service or not knowledge_service.is_ready():
            raise HTTPException(status_code=503, detail="Knowledge service not available")
        
        documents = await knowledge_service.list_documents(limit)
        
        return {
            "success": True,
            "documents": [doc.to_dict() for doc in documents],
            "total": len(documents)
        }
        
    except Exception as e:
        logger.error(f"Failed to list knowledge documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# AI Processing Service endpoints
@app.get("/api/processing/health")
async def processing_health_check():
    """Comprehensive health check for the AI processing pipeline"""
    try:
        if not ai_processing_service:
            raise HTTPException(status_code=503, detail="AI processing service not initialized")
        
        health_status = await ai_processing_service.health_check()
        return health_status
        
    except Exception as e:
        logger.error(f"Processing health check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/processing/stats")
async def get_processing_statistics():
    """Get AI processing pipeline statistics"""
    try:
        if not ai_processing_service:
            raise HTTPException(status_code=503, detail="AI processing service not initialized")
        
        stats = await ai_processing_service.get_processing_stats()
        return {
            "success": True,
            "statistics": stats
        }
        
    except Exception as e:
        logger.error(f"Failed to get processing statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Batch processing endpoint
class BatchProcessRequest(BaseModel):
    inputs: List[dict]

@app.post("/api/process/batch")
async def process_batch(request: BatchProcessRequest):
    """Process multiple inputs in batch"""
    try:
        if not ai_processing_service or not ai_processing_service.is_ready():
            raise HTTPException(status_code=503, detail="AI processing service not available")
        
        if not request.inputs:
            raise HTTPException(status_code=400, detail="No inputs provided")
        
        if len(request.inputs) > 10:  # Limit batch size
            raise HTTPException(status_code=400, detail="Batch size too large (max 10)")
        
        # Process batch
        results = await ai_processing_service.process_batch(request.inputs)
        
        # Convert results to API format
        api_results = []
        for result in results:
            api_results.append({
                "success": result.success,
                "transcription": result.transcription,
                "understanding": result.understanding,
                "actions": result.actions,
                "processing_time": result.processing_time,
                "timestamp": result.timestamp,
                "error": result.error,
                "metadata": result.metadata
            })
        
        successful_count = sum(1 for r in results if r.success)
        
        return {
            "success": True,
            "results": api_results,
            "total_processed": len(results),
            "successful": successful_count,
            "failed": len(results) - successful_count
        }
        
    except Exception as e:
        logger.error(f"Batch processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_level="info"
    )