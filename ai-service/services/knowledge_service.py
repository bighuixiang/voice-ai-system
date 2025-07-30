import os
import re
import json
import asyncio
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime
from collections import defaultdict, Counter
import logging

logger = logging.getLogger(__name__)

@dataclass
class KnowledgeDocument:
    """Knowledge document data structure"""
    id: int
    title: str
    content: str
    keywords: List[str]
    created_at: datetime
    metadata: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        data = asdict(self)
        data['created_at'] = self.created_at.isoformat()
        return data

@dataclass
class SearchResult:
    """Search result data structure"""
    document: KnowledgeDocument
    relevance_score: float
    matched_keywords: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'document': self.document.to_dict(),
            'relevance_score': self.relevance_score,
            'matched_keywords': self.matched_keywords
        }

class MemoryKnowledgeService:
    """Simple memory-based knowledge service with keyword matching"""
    
    def __init__(self):
        self.documents: List[KnowledgeDocument] = []
        self.keyword_index: Dict[str, List[int]] = defaultdict(list)
        self.next_id = 1
        self._initialized = False
        self.knowledge_dir = os.path.join(os.getcwd(), "knowledge")
        
        # Configuration
        self.max_results = 10
        self.min_keyword_length = 2
        self.stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
        }    

    async def initialize(self) -> bool:
        """Initialize the knowledge service and load existing documents"""
        try:
            logger.info("Initializing memory knowledge service...")
            
            # Create knowledge directory if it doesn't exist
            os.makedirs(self.knowledge_dir, exist_ok=True)
            
            # Load existing documents from knowledge directory
            await self._load_knowledge_files()
            
            self._initialized = True
            logger.info(f"Knowledge service initialized with {len(self.documents)} documents")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize knowledge service: {e}")
            return False
    
    def is_ready(self) -> bool:
        """Check if knowledge service is ready"""
        return self._initialized
    
    async def _load_knowledge_files(self):
        """Load knowledge files from the knowledge directory"""
        try:
            supported_extensions = ['.txt', '.md']
            
            for filename in os.listdir(self.knowledge_dir):
                if any(filename.lower().endswith(ext) for ext in supported_extensions):
                    file_path = os.path.join(self.knowledge_dir, filename)
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read().strip()
                        
                        if content:
                            title = os.path.splitext(filename)[0]
                            await self.add_document(title, content, {
                                'source': 'file',
                                'filename': filename,
                                'file_path': file_path
                            })
                            logger.info(f"Loaded knowledge file: {filename}")
                    
                    except Exception as e:
                        logger.warning(f"Failed to load knowledge file {filename}: {e}")
            
        except Exception as e:
            logger.error(f"Failed to load knowledge files: {e}")
    
    async def add_document(self, title: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> int:
        """Add a document to the knowledge base"""
        try:
            # Extract keywords from content
            keywords = self._extract_keywords(content)
            
            # Create document
            document = KnowledgeDocument(
                id=self.next_id,
                title=title.strip(),
                content=content.strip(),
                keywords=keywords,
                created_at=datetime.now(),
                metadata=metadata or {}
            )
            
            # Add to documents list
            self.documents.append(document)
            
            # Update keyword index
            self._update_keyword_index(document)
            
            doc_id = self.next_id
            self.next_id += 1
            
            logger.info(f"Added document '{title}' with ID {doc_id} ({len(keywords)} keywords)")
            return doc_id
            
        except Exception as e:
            logger.error(f"Failed to add document '{title}': {e}")
            raise  
  
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from text using simple NLP techniques"""
        try:
            # Convert to lowercase and remove special characters
            text = re.sub(r'[^\w\s]', ' ', text.lower())
            
            # Split into words
            words = text.split()
            
            # Filter words
            keywords = []
            for word in words:
                word = word.strip()
                if (len(word) >= self.min_keyword_length and 
                    word not in self.stop_words and 
                    not word.isdigit()):
                    keywords.append(word)
            
            # Count word frequency and keep most common
            word_counts = Counter(keywords)
            
            # Get top keywords (limit to 50 per document)
            top_keywords = [word for word, count in word_counts.most_common(50)]
            
            return top_keywords
            
        except Exception as e:
            logger.error(f"Keyword extraction failed: {e}")
            return []
    
    def _update_keyword_index(self, document: KnowledgeDocument):
        """Update the keyword index with document keywords"""
        try:
            for keyword in document.keywords:
                if document.id not in self.keyword_index[keyword]:
                    self.keyword_index[keyword].append(document.id)
        except Exception as e:
            logger.error(f"Failed to update keyword index: {e}")
    
    async def search(self, query: str, max_results: Optional[int] = None) -> List[SearchResult]:
        """Search for documents using keyword matching with relevance scoring"""
        if not self.is_ready():
            raise RuntimeError("Knowledge service not initialized")
        
        if not query or not query.strip():
            return []
        
        try:
            max_results = max_results or self.max_results
            
            # Extract keywords from query
            query_keywords = self._extract_keywords(query)
            
            if not query_keywords:
                logger.warning("No valid keywords extracted from query")
                return []
            
            logger.info(f"Searching for: {query_keywords}")
            
            # Find matching documents
            document_scores = self._calculate_relevance_scores(query_keywords)
            
            # Sort by relevance score
            sorted_results = sorted(document_scores.items(), key=lambda x: x[1][0], reverse=True)
            
            # Create search results
            results = []
            for doc_id, (score, matched_keywords) in sorted_results[:max_results]:
                document = self._get_document_by_id(doc_id)
                if document and score > 0:
                    results.append(SearchResult(
                        document=document,
                        relevance_score=score,
                        matched_keywords=matched_keywords
                    ))
            
            logger.info(f"Found {len(results)} relevant documents")
            return results
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []    
  
  def _calculate_relevance_scores(self, query_keywords: List[str]) -> Dict[int, Tuple[float, List[str]]]:
        """Calculate relevance scores for documents based on keyword matching"""
        document_scores = defaultdict(lambda: (0.0, []))
        
        try:
            for query_keyword in query_keywords:
                # Find documents containing this keyword
                matching_doc_ids = self.keyword_index.get(query_keyword, [])
                
                for doc_id in matching_doc_ids:
                    document = self._get_document_by_id(doc_id)
                    if not document:
                        continue
                    
                    current_score, current_matches = document_scores[doc_id]
                    
                    # Calculate keyword score
                    keyword_score = self._calculate_keyword_score(query_keyword, document)
                    
                    # Update document score
                    new_score = current_score + keyword_score
                    new_matches = current_matches + [query_keyword] if query_keyword not in current_matches else current_matches
                    
                    document_scores[doc_id] = (new_score, new_matches)
            
            # Normalize scores
            if document_scores:
                max_score = max(score for score, _ in document_scores.values())
                if max_score > 0:
                    for doc_id in document_scores:
                        score, matches = document_scores[doc_id]
                        normalized_score = score / max_score
                        document_scores[doc_id] = (normalized_score, matches)
            
            return dict(document_scores)
            
        except Exception as e:
            logger.error(f"Relevance score calculation failed: {e}")
            return {}
    
    def _calculate_keyword_score(self, keyword: str, document: KnowledgeDocument) -> float:
        """Calculate score for a keyword in a document"""
        try:
            # Count occurrences in content
            content_lower = document.content.lower()
            keyword_count = content_lower.count(keyword)
            
            # Base score from frequency
            frequency_score = min(keyword_count * 0.1, 1.0)  # Cap at 1.0
            
            # Bonus for title match
            title_bonus = 0.5 if keyword in document.title.lower() else 0.0
            
            # Bonus for exact word match (not substring)
            word_pattern = r'\b' + re.escape(keyword) + r'\b'
            exact_matches = len(re.findall(word_pattern, content_lower))
            exact_bonus = min(exact_matches * 0.2, 0.8)  # Cap at 0.8
            
            # Length penalty for very long documents
            length_penalty = max(0.5, 1.0 - (len(document.content) / 10000))
            
            total_score = (frequency_score + title_bonus + exact_bonus) * length_penalty
            
            return min(total_score, 2.0)  # Cap total score
            
        except Exception as e:
            logger.error(f"Keyword score calculation failed: {e}")
            return 0.0
    
    def _get_document_by_id(self, doc_id: int) -> Optional[KnowledgeDocument]:
        """Get document by ID"""
        try:
            for document in self.documents:
                if document.id == doc_id:
                    return document
            return None
        except Exception as e:
            logger.error(f"Failed to get document by ID {doc_id}: {e}")
            return None    
   
 async def get_document(self, doc_id: int) -> Optional[KnowledgeDocument]:
        """Get a document by ID"""
        return self._get_document_by_id(doc_id)
    
    async def update_document(self, doc_id: int, title: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Update an existing document"""
        try:
            document = self._get_document_by_id(doc_id)
            if not document:
                logger.warning(f"Document with ID {doc_id} not found")
                return False
            
            # Remove old keywords from index
            for keyword in document.keywords:
                if doc_id in self.keyword_index[keyword]:
                    self.keyword_index[keyword].remove(doc_id)
                    if not self.keyword_index[keyword]:
                        del self.keyword_index[keyword]
            
            # Update document
            document.title = title.strip()
            document.content = content.strip()
            document.keywords = self._extract_keywords(content)
            document.metadata = metadata or document.metadata
            
            # Update keyword index
            self._update_keyword_index(document)
            
            logger.info(f"Updated document {doc_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update document {doc_id}: {e}")
            return False
    
    async def delete_document(self, doc_id: int) -> bool:
        """Delete a document"""
        try:
            document = self._get_document_by_id(doc_id)
            if not document:
                logger.warning(f"Document with ID {doc_id} not found")
                return False
            
            # Remove from keyword index
            for keyword in document.keywords:
                if doc_id in self.keyword_index[keyword]:
                    self.keyword_index[keyword].remove(doc_id)
                    if not self.keyword_index[keyword]:
                        del self.keyword_index[keyword]
            
            # Remove from documents list
            self.documents = [doc for doc in self.documents if doc.id != doc_id]
            
            logger.info(f"Deleted document {doc_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to delete document {doc_id}: {e}")
            return False
    
    async def list_documents(self, limit: Optional[int] = None) -> List[KnowledgeDocument]:
        """List all documents"""
        try:
            if limit:
                return self.documents[:limit]
            return self.documents.copy()
        except Exception as e:
            logger.error(f"Failed to list documents: {e}")
            return []
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Get knowledge base statistics"""
        try:
            total_docs = len(self.documents)
            total_keywords = len(self.keyword_index)
            
            if total_docs > 0:
                avg_keywords_per_doc = sum(len(doc.keywords) for doc in self.documents) / total_docs
                avg_content_length = sum(len(doc.content) for doc in self.documents) / total_docs
            else:
                avg_keywords_per_doc = 0
                avg_content_length = 0
            
            return {
                'total_documents': total_docs,
                'total_unique_keywords': total_keywords,
                'average_keywords_per_document': round(avg_keywords_per_doc, 2),
                'average_content_length': round(avg_content_length, 2),
                'initialized': self._initialized
            }
            
        except Exception as e:
            logger.error(f"Failed to get statistics: {e}")
            return {}
    
    async def search_by_keywords(self, keywords: List[str], max_results: Optional[int] = None) -> List[SearchResult]:
        """Search directly by a list of keywords"""
        if not keywords:
            return []
        
        # Join keywords into a query string
        query = ' '.join(keywords)
        return await self.search(query, max_results)
    
    async def get_related_documents(self, doc_id: int, max_results: int = 5) -> List[SearchResult]:
        """Get documents related to a given document based on keyword similarity"""
        try:
            document = self._get_document_by_id(doc_id)
            if not document:
                return []
            
            # Use document keywords as search query
            if not document.keywords:
                return []
            
            # Search using document keywords
            results = await self.search_by_keywords(document.keywords[:10], max_results + 1)  # +1 to exclude self
            
            # Remove the original document from results
            filtered_results = [result for result in results if result.document.id != doc_id]
            
            return filtered_results[:max_results]
            
        except Exception as e:
            logger.error(f"Failed to get related documents for {doc_id}: {e}")
            return []