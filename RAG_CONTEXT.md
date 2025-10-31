# RAG System Implementation Context

## Date: 2025-10-31
## Status: In Progress - Architecture Design Phase

---

## Executive Summary

This document captures the comprehensive analysis of three RAG research papers and outlines the implementation strategy for a production-ready Retrieval-Augmented Generation system in the Word AI Plugin 2.0 project.

---

## 1. Research Paper Analysis

### 1.1 "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks" (Lewis et al., 2020)

#### Key Findings

**Core Architecture:**
- **Hybrid Memory Model**: Combines parametric memory (LLM parameters) with non-parametric memory (document index)
- **Two Components**:
  1. **Retriever** (pη): Dense Passage Retrieval (DPR) using BERT-base bi-encoder
  2. **Generator** (pθ): BART-large seq2seq model (400M parameters)

**Two RAG Formulations:**

1. **RAG-Sequence**:
   - Uses the SAME retrieved document to generate the complete sequence
   - Treats retrieved document as single latent variable
   - Formula: `p(y|x) ≈ Σ pη(z|x) * Π pθ(yi|x,z,y1:i-1)`
   - Best for: Tasks requiring consistent context across entire answer
   - Decoding: Requires special "Thorough Decoding" - run beam search per document

2. **RAG-Token**:
   - Can draw a DIFFERENT latent document for each target token
   - Allows generator to choose content from several documents
   - Formula: `p(y|x) ≈ Π Σ pη(z|x) * pθ(yi|x,z,y1:i-1)`
   - Best for: Combining information from multiple sources
   - Decoding: Standard beam search works

**Key Implementation Details:**

1. **Document Index**:
   - Wikipedia December 2018 dump
   - Split into 100-word chunks → 21M documents
   - FAISS with Hierarchical Navigable Small World (HNSW) approximation
   - CPU storage: ~100GB (can compress to 36GB with FAISS compression)

2. **Training**:
   - Joint end-to-end training of retriever + generator
   - Document encoder (BERTd) kept FROZEN (not updated during training)
   - Only query encoder (BERTq) and BART generator are fine-tuned
   - Uses negative log-likelihood loss
   - Retrieve k ∈ {5, 10} documents during training

3. **Retrieval Mechanism**:
   - Dense embeddings: `pη(z|x) ∝ exp(d(z)ᵀq(x))`
   - Maximum Inner Product Search (MIPS)
   - Top-K truncated distribution
   - Can hot-swap document index without retraining

**Performance Insights:**
- Achieves 44.5% EM on Natural Questions (vs 34.5% for T5-11B closed-book)
- Generates more specific, diverse, and factual responses than BART
- Can generate correct answers even when answer not in retrieved docs (11.8% on NQ)
- Retrieval learning improves results significantly vs fixed BM25

**Advantages Over Parametric-Only Models:**
- Can be updated by simply replacing document index
- Reduces hallucination through grounded retrieval
- Provides interpretability (can inspect retrieved documents)
- More parameter-efficient than pure parametric scaling

---

### 1.2 "A System for Comprehensive Assessment of RAG Frameworks" (SCARF Paper)

#### Key Findings

**Evaluation Metrics** (from RAGAS framework):

1. **Faithfulness**:
   - Measures consistency of generated response with retrieved context
   - Checks if claims are substantiated by retrieved passages
   - Critical for ensuring factual, trustworthy outputs

2. **Answer Relevance**:
   - Evaluates how well the response addresses user's query
   - Analyzes relationship between query intent and response content
   - Ensures responses are meaningful and precise

3. **Context Relevance**:
   - Focuses on quality and specificity of retrieved information
   - Examines if retrieved passages are relevant to input query
   - Directly influences overall quality of output

**Additional Standard Metrics:**
- ROUGE (lexical similarity to reference answers)
- BLEU (overlap-based evaluation)
- BERTScore (semantic similarity)
- Response latency and throughput

**Evaluation Framework Requirements:**
- Black-box testing capability (can test deployed systems via API)
- Modular component replacement (swap vector DBs, LLM engines)
- Multi-RAG system comparison
- Automated testing pipeline
- Comprehensive reporting

**Design Principles:**
- Separation of concerns: retrieval vs generation metrics
- End-to-end pipeline evaluation
- Support for different deployment configurations
- Flexibility in switching components (Ollama, vLLM, different vector DBs)

---

### 1.3 Third Paper Analysis

**Note:** The "Diversity Enhances an LLM's Performance in RAG and Long Context Task" PDF was not successfully loaded. Key principles to incorporate from title:
- Diversity in retrieval results likely improves performance
- Should implement diversity-promoting mechanisms in document selection
- Consider techniques like MMR (Maximal Marginal Relevance) for diverse retrieval

---

## 2. Current Implementation Analysis

### 2.1 Existing System Overview

**Current Architecture:**
```
User Query → AI Route (/api/ai/query) → OpenAI/Gemini Service → Direct LLM Call
                ↓
          Context Files (in-memory, not persistent)
```

**Capabilities:**
- ✅ File upload and parsing (PDF, DOCX, CSV, TXT, MD)
- ✅ Text chunking with overlap (4000 char chunks, 200 char overlap)
- ✅ Prompt building with context injection
- ✅ Multi-provider support (OpenAI, Gemini)
- ✅ Caching layer for query responses
- ✅ Rate limiting and error handling

**Limitations:**
- ❌ No persistent vector store
- ❌ No semantic search/retrieval
- ❌ No embeddings generation
- ❌ Context concatenation only (no intelligent retrieval)
- ❌ No RAG-specific evaluation metrics
- ❌ Limited to prompt size constraints

---

## 3. RAG System Design

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     RAG Pipeline Architecture                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────┐      ┌───────────────┐      ┌─────────────┐
│   Document  │ ───> │   Embedding   │ ───> │   Vector    │
│   Ingestion │      │   Service     │      │   Store     │
└─────────────┘      └───────────────┘      └─────────────┘
                                                    │
                                                    │ Retrieval
                                                    ↓
┌─────────────┐      ┌───────────────┐      ┌─────────────┐
│    User     │ ───> │   Query       │ ───> │  Retriever  │
│    Query    │      │   Encoder     │      │  (DPR-like) │
└─────────────┘      └───────────────┘      └─────────────┘
                                                    │
                                                    │ Top-K Docs
                                                    ↓
                                             ┌─────────────┐
                                             │ RAG-Sequence│
                                             │     OR      │
                                             │ RAG-Token   │
                                             └─────────────┘
                                                    │
                                                    │ Augmented
                                                    ↓
                                             ┌─────────────┐
                                             │  Generator  │
                                             │ (LLM/BART)  │
                                             └─────────────┘
                                                    │
                                                    ↓
                                             ┌─────────────┐
                                             │  Response + │
                                             │   Sources   │
                                             └─────────────┘
```

### 3.2 Component Specifications

#### 3.2.1 Vector Store Service

**Purpose:** Persistent storage and retrieval of document embeddings

**Features:**
- Document chunking (100-word or configurable chunks)
- Embedding storage with metadata
- Semantic similarity search (cosine similarity)
- Top-K retrieval with confidence scores
- Support for multiple collections/namespaces
- CRUD operations on documents

**Technology Options:**
1. **In-Memory (Initial):** Simple Map-based implementation
2. **Chroma DB:** Lightweight, embeddable vector database
3. **Qdrant:** Production-ready with advanced filtering
4. **Pinecone:** Managed cloud solution

**API:**
```typescript
interface VectorStore {
  addDocuments(documents: Document[], embeddings: number[][]): Promise<string[]>;
  search(queryEmbedding: number[], k: number): Promise<SearchResult[]>;
  getDocument(id: string): Promise<Document | null>;
  deleteDocuments(ids: string[]): Promise<void>;
  clear(): Promise<void>;
}
```

#### 3.2.2 Embedding Service

**Purpose:** Generate dense vector embeddings for documents and queries

**Features:**
- Model: OpenAI text-embedding-3-small (1536 dimensions) or similar
- Batch processing for efficiency
- Caching for repeated queries
- Normalization of embeddings

**API:**
```typescript
interface EmbeddingService {
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  getDimensions(): number;
}
```

#### 3.2.3 RAG Pipeline Service

**Purpose:** Orchestrate retrieval and generation

**Modes:**
1. **RAG-Sequence Mode:**
   - Retrieve Top-K documents once
   - Use same documents for entire response generation
   - Better for coherent, single-source answers

2. **RAG-Token Mode:**
   - Retrieve Top-K documents once
   - Marginalize over documents per token
   - Better for multi-source synthesis

**Configuration:**
```typescript
interface RAGConfig {
  mode: 'rag-sequence' | 'rag-token';
  topK: number; // Number of documents to retrieve (5-10)
  chunkSize: number; // Size of document chunks
  chunkOverlap: number; // Overlap between chunks
  retrievalThreshold: number; // Minimum similarity score
  maxContextTokens: number; // Max tokens for context
}
```

**API:**
```typescript
interface RAGPipeline {
  indexDocuments(files: File[]): Promise<IndexResult>;
  query(question: string, config: RAGConfig): Promise<RAGResponse>;
  evaluateResponse(response: RAGResponse, groundTruth?: string): Promise<EvaluationMetrics>;
}
```

#### 3.2.4 Evaluation Service

**Purpose:** Measure RAG system performance

**Metrics:**
```typescript
interface EvaluationMetrics {
  // Retrieval Metrics
  retrieval: {
    precision: number;
    recall: number;
    mrr: number; // Mean Reciprocal Rank
    ndcg: number; // Normalized Discounted Cumulative Gain
  };

  // Generation Metrics
  generation: {
    faithfulness: number; // RAGAS metric
    answerRelevance: number; // RAGAS metric
    contextRelevance: number; // RAGAS metric
    rouge: { rouge1: number; rouge2: number; rougeL: number };
    bleu: number;
  };

  // Performance Metrics
  performance: {
    latency: number; // Response time in ms
    tokenUsage: { prompt: number; completion: number; total: number };
  };
}
```

---

## 4. Implementation Plan

### Phase 1: Foundation (Current)
- [x] Analyze research papers
- [x] Design RAG architecture
- [ ] Create context.md documentation

### Phase 2: Core Services (Next Steps)
- [ ] Implement Embedding Service
  - OpenAI embeddings integration
  - Batch processing
  - Caching layer

- [ ] Implement Vector Store Service
  - In-memory implementation first
  - Document chunking integration
  - Similarity search

- [ ] Implement Retriever Component
  - Query encoding
  - Top-K retrieval
  - Score normalization

### Phase 3: RAG Pipeline
- [ ] Implement RAG-Sequence mode
  - Document marginalization
  - Context assembly
  - Generator integration

- [ ] Implement RAG-Token mode
  - Token-level marginalization
  - Multi-document synthesis

- [ ] Add source attribution
  - Track retrieved documents
  - Include citations in responses

### Phase 4: Evaluation & Optimization
- [ ] Implement RAGAS metrics
  - Faithfulness scoring
  - Relevance metrics
  - Context quality assessment

- [ ] Add performance monitoring
  - Latency tracking
  - Token usage optimization
  - Cache hit rates

- [ ] Implement A/B testing framework
  - Compare RAG-Sequence vs RAG-Token
  - Optimize retrieval parameters
  - Fine-tune chunk sizes

### Phase 5: Production Readiness
- [ ] Add persistent vector store (Chroma/Qdrant)
- [ ] Implement document management UI
- [ ] Add comprehensive error handling
- [ ] Create deployment documentation
- [ ] Performance optimization

---

## 5. Key Design Decisions

### 5.1 Retrieval Strategy
**Decision:** Implement both RAG-Sequence and RAG-Token modes

**Rationale:**
- Different use cases benefit from different approaches
- RAG-Sequence: Better for single-document QA, coherent narratives
- RAG-Token: Better for synthesis across multiple sources

### 5.2 Vector Store
**Decision:** Start with in-memory, plan for Chroma DB migration

**Rationale:**
- In-memory allows rapid prototyping
- Chroma DB provides persistence without infrastructure overhead
- Easy migration path to production-grade solutions (Qdrant/Pinecone)

### 5.3 Embedding Model
**Decision:** Use OpenAI text-embedding-3-small

**Rationale:**
- 1536 dimensions (good balance)
- High quality embeddings
- Existing OpenAI integration
- Cost-effective

### 5.4 Chunk Size
**Decision:** 100-200 words per chunk with 20% overlap

**Rationale:**
- Follows RAG paper recommendations
- Balances context preservation with retrieval precision
- Overlap prevents information loss at boundaries

### 5.5 Evaluation Strategy
**Decision:** Implement RAGAS metrics + traditional metrics

**Rationale:**
- RAGAS provides RAG-specific evaluation
- Traditional metrics (ROUGE, BLEU) enable comparison with baselines
- Latency/token tracking essential for production

---

## 6. API Design

### 6.1 Document Ingestion

```typescript
POST /api/rag/index
Content-Type: multipart/form-data

{
  files: File[],
  config: {
    chunkSize?: number,
    chunkOverlap?: number,
    namespace?: string
  }
}

Response:
{
  documentIds: string[],
  chunkCount: number,
  indexTime: number
}
```

### 6.2 RAG Query

```typescript
POST /api/rag/query
Content-Type: application/json

{
  question: string,
  mode: 'rag-sequence' | 'rag-token',
  topK?: number,
  namespace?: string,
  settings: {
    model: string,
    temperature: number,
    maxTokens: number
  }
}

Response:
{
  answer: string,
  sources: Array<{
    documentId: string,
    chunk: string,
    score: number
  }>,
  metrics: {
    retrievalTime: number,
    generationTime: number,
    totalTime: number,
    tokensUsed: number
  }
}
```

### 6.3 Evaluation

```typescript
POST /api/rag/evaluate
Content-Type: application/json

{
  query: string,
  response: string,
  retrievedDocuments: string[],
  groundTruth?: string
}

Response: EvaluationMetrics
```

---

## 7. Testing Strategy

### 7.1 Unit Tests
- Embedding service: Dimension validation, batch processing
- Vector store: CRUD operations, similarity search accuracy
- Text chunker: Boundary conditions, overlap logic
- RAG pipeline: Component integration

### 7.2 Integration Tests
- End-to-end RAG flow
- Multi-document retrieval
- Source attribution accuracy
- Error handling

### 7.3 Performance Tests
- Retrieval latency (< 100ms for 10K docs)
- Generation latency (< 3s for typical response)
- Concurrent query handling
- Cache effectiveness

### 7.4 Quality Tests
- RAGAS metric validation
- Comparison with ground truth answers
- Retrieval precision/recall
- Response coherence

---

## 8. Future Enhancements

### 8.1 Advanced Retrieval
- **Hybrid Search:** Combine semantic + keyword (BM25) search
- **Reranking:** Use cross-encoder for reranking top-K results
- **Query Expansion:** Expand user queries for better retrieval
- **MMR (Maximal Marginal Relevance):** Diversity in retrieved documents

### 8.2 Advanced Generation
- **Iterative Refinement:** Multi-pass generation with self-critique
- **Confidence Scoring:** Uncertainty estimation for responses
- **Streaming Responses:** Token-by-token streaming for better UX

### 8.3 Knowledge Management
- **Document Versioning:** Track document updates over time
- **Metadata Filtering:** Filter by date, source, document type
- **Hierarchical Structure:** Support for document hierarchies

### 8.4 Multi-modal Support
- **Image Understanding:** Process images in documents
- **Table Extraction:** Better handling of structured data
- **Cross-modal Retrieval:** Text queries → image retrieval

---

## 9. References

1. Lewis et al. (2020). "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks"
2. SCARF Paper. "A System for Comprehensive Assessment of RAG Frameworks"
3. Es et al. (2023). "RAGAS: Automated Evaluation of Retrieval Augmented Generation"
4. Gao et al. (2023). "Retrieval-Augmented Generation for Large Language Models: A Survey"

---

## 10. Next Session Pickup Points

### Immediate Tasks:
1. ✅ **Context.md created** - This document
2. 🔄 **Implement Embedding Service** - `backend/src/services/embeddingService.ts`
3. 🔄 **Implement Vector Store Service** - `backend/src/services/vectorStore.ts`
4. 🔄 **Implement RAG Pipeline Service** - `backend/src/services/ragPipeline.ts`

### Code Files to Create:
```
backend/src/
├── services/
│   ├── embeddingService.ts       # NEW - Generate embeddings
│   ├── vectorStore.ts             # NEW - Store and retrieve vectors
│   ├── ragPipeline.ts             # NEW - RAG orchestration
│   └── evaluationService.ts       # NEW - Metrics and evaluation
├── types/
│   └── rag.ts                     # NEW - RAG-specific types
└── routes/
    └── rag.ts                     # NEW - RAG API endpoints
```

### Key Implementation Notes:
- Use existing `textChunker.ts` for document chunking
- Integrate with existing OpenAI service for generation
- Leverage existing cache infrastructure
- Follow existing error handling patterns
- Maintain backward compatibility with `/api/ai/query` endpoint

### Commands to Run (if needed):
```bash
# Install additional dependencies
npm install --save @types/node-cache
npm install --save chromadb  # For vector store (Phase 3)

# Run tests
npm test

# Start development server
npm run dev
```

---

## Document Metadata
- **Created:** 2025-10-31
- **Last Updated:** 2025-10-31
- **Version:** 1.0
- **Author:** Claude (AI Assistant)
- **Status:** Living Document - Update as implementation progresses
