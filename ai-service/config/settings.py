import os
from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # Application settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    
    # Model settings
    WHISPER_MODEL: str = "base"
    LLM_MODEL: str = "microsoft/DialoGPT-medium"
    DEVICE: str = "cpu"  # or "cuda" if GPU available
    
    # Vector database settings
    VECTOR_DB_PATH: str = "./vector_db"
    VECTOR_DB_COLLECTION: str = "knowledge_base"
    
    # File settings
    MAX_AUDIO_SIZE: int = 50 * 1024 * 1024  # 50MB
    SUPPORTED_AUDIO_FORMATS: List[str] = ["wav", "mp3", "m4a", "flac"]
    
    # Processing settings
    MAX_CONCURRENT_TASKS: int = 4
    TASK_TIMEOUT: int = 300  # 5 minutes
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()