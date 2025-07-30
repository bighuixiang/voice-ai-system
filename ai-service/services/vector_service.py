import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any, Optional
from config.settings import settings
import logging
import os

logger = logging.getLogger(__name__)

class VectorService:
    def __init__(self):
        self.client = None
        self.collection = None
        self.embedding_model = None
        self.db_path = settings.VECTOR_DB_PATH
        self.collection_name = settings.VECTOR_DB_COLLECTION
        self._ready = False
    
    async def initialize(self):
        """Initialize the vector database and embedding model"""
        try:
            logger.info("Initializing vector database...")
            
            # Create directory if it doesn't exist
            os.makedirs(self.db_path, exist_ok=True)
            
            # Initialize ChromaDB client
            self.client = chromadb.PersistentClient(
                path=self.db_path,
                settings=ChromaSettings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )
            
            # Get or create collection
            try:
                self.collection = self.client.get_collection(name=self.collection_name)
                logger.info(f"Loaded existing collection: {self.collection_name}")
            except:
                self.collection = self.client.create_collection(
                    name=self.collection_name,
                    metadata={"description": "Knowledge base for voice AI system"}
                )
                logger.info(f"Created new collection: {self.collection_name}")
            
            # Initialize embedding model
            logger.info("Loading sentence transformer model...")
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
            
            self._ready = True
            logger.info("Vector database initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize vector database: {e}")
            raise
    
    def is_ready(self) -> bool:
        """Check if vector service is ready"""
        return self._ready and self.client is not None and self.collection is not None
    
    async def add_document(self, document_id: str, text: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Add a document to the vector database"""
        if not self.is_ready():
            raise RuntimeError("Vector service not initialized")
        
        try:
            # Generate embedding
            embedding = self.embedding_model.encode(text).tolist()
            
            # Add to collection
            self.collection.add(
                embeddings=[embedding],
                documents=[text],
                metadatas=[metadata or {}],
                ids=[document_id]
            )
            
            logger.info(f"Added document {document_id} to vector database")
            return True
            
        except Exception as e:
            logger.error(f"Failed to add document {document_id}: {e}")
            return False
    
    async def search(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """Search for similar documents"""
        if not self.is_ready():
            raise RuntimeError("Vector service not initialized")
        
        try:
            # Generate query embedding
            query_embedding = self.embedding_model.encode(query).tolist()
            
            # Search in collection
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                include=['documents', 'metadatas', 'distances']
            )
            
            # Format results
            formatted_results = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    formatted_results.append({
                        'document': doc,
                        'metadata': results['metadatas'][0][i] if results['metadatas'] else {},
                        'distance': results['distances'][0][i] if results['distances'] else 0.0,
                        'similarity': 1 - results['distances'][0][i] if results['distances'] else 1.0
                    })
            
            return formatted_results
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []
    
    async def update_document(self, document_id: str, text: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Update an existing document"""
        if not self.is_ready():
            raise RuntimeError("Vector service not initialized")
        
        try:
            # Generate new embedding
            embedding = self.embedding_model.encode(text).tolist()
            
            # Update in collection
            self.collection.update(
                ids=[document_id],
                embeddings=[embedding],
                documents=[text],
                metadatas=[metadata or {}]
            )
            
            logger.info(f"Updated document {document_id} in vector database")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update document {document_id}: {e}")
            return False
    
    async def delete_document(self, document_id: str) -> bool:
        """Delete a document from the vector database"""
        if not self.is_ready():
            raise RuntimeError("Vector service not initialized")
        
        try:
            self.collection.delete(ids=[document_id])
            logger.info(f"Deleted document {document_id} from vector database")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete document {document_id}: {e}")
            return False
    
    async def get_collection_count(self) -> int:
        """Get the number of documents in the collection"""
        if not self.is_ready():
            return 0
        
        try:
            return self.collection.count()
        except Exception as e:
            logger.error(f"Failed to get collection count: {e}")
            return 0
    
    async def list_documents(self, limit: int = 100) -> List[Dict[str, Any]]:
        """List documents in the collection"""
        if not self.is_ready():
            raise RuntimeError("Vector service not initialized")
        
        try:
            results = self.collection.get(
                limit=limit,
                include=['documents', 'metadatas']
            )
            
            documents = []
            if results['documents']:
                for i, doc in enumerate(results['documents']):
                    documents.append({
                        'id': results['ids'][i],
                        'document': doc,
                        'metadata': results['metadatas'][i] if results['metadatas'] else {}
                    })
            
            return documents
            
        except Exception as e:
            logger.error(f"Failed to list documents: {e}")
            return []