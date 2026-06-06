# Modular Services Reorganization Proposal

## Background & Goal

The current structure of `src/services/` mixes core orchestration system files, general helpers, database transaction logic, and specific analytical modules (like Face Recognition, AI Metadata Generation, and Photo Date Estimation) with their internal helper files separated across multiple distant directories.

To prepare the codebase for **pluggable third-party modules** and improve readability, this proposal details a self-contained, domain-driven directory structure and outlines how to decouple modules from direct SQL queries via a high-level database service layer. We also outline how **Zod v4** can be integrated to enforce strict configuration and run-time parameter validation.

---

## 1. Proposed Directory Structure

We propose grouping all core platform systems under a `core/` subdirectory, and moving each logical module (including its prompts, helpers, and utilities) into its own subfolder under a unified `modules/` directory.

```text
src/services/
├── core/                           # Core Platform Systems & Infrastructure
│   ├── db/                         # Database connection and low-level managers
│   ├── events/                     # System-wide event bus and types
│   ├── jobs/                       # Long-running task queue management
│   ├── state/                      # Core application state
│   ├── utils/                      # Non-module-specific utility functions
│   │   ├── file-utils.ts
│   │   └── math-utils.ts
│   └── modelPaths.ts               # Shared machine learning model definitions
│
├── repositories/                   # Higher-Level Database Access (Core Service Layer)
│   ├── assetRepository.ts          # Methods to fetch assets, paths, dimensions
│   ├── photoMetadataRepository.ts  # Projections, blocks, assertions
│   └── tagRepository.ts            # Tag definitions, assignments, proposals
│
├── modules/                        # Pluggable Analytics & Mutation Modules
│   ├── generateAiMetadata/         # Gemini-based Captioning and Tagging
│   │   ├── index.ts                # Module entry point (from generateAiMetadataModule.ts)
│   │   ├── schema.ts               # Zod validation schemas for configuration/parameters
│   │   ├── liveRuntime.ts          # Core Gemini API communication logic
│   │   ├── geminiPrompts.ts        # AI prompt definitions
│   │   ├── geminiResponseBoxes.ts  # Visual regions & boxes parsers
│   │   ├── geminiResponseSchema.ts # AI response structured JSON formats
│   │   ├── geminiTypes.ts          # Internal types used by the Gemini client
│   │   ├── quotaManager.ts         # Rate limiter & token tracker
│   │   └── tagVocabularyEnforcement.ts
│   │
│   ├── faceAnalysis/               # Face Detection and Vector Clustering
│   │   ├── index.ts                # Main runner (detectFaces, generateVectors, resolvePeople)
│   │   ├── retinaFaceDetector.ts   # Detection model client
│   │   ├── arcFaceRecognizer.ts    # Embedding generation model client
│   │   ├── faceDetectionSuppression.ts
│   │   ├── faceImageGeometry.ts
│   │   └── peopleResolution.ts
│   │
│   ├── similarityGrouping/         # Duplicate & Similarity Album Grouping
│   │   ├── index.ts                # Main runner (groupSimilarPhotosModule.ts)
│   │   ├── groupingGraph.ts
│   │   ├── groupingHierarchy.ts
│   │   ├── groupingPersistence.ts
│   │   └── groupingQueries.ts
│   │
│   ├── photoDateEstimate/          # Multiclue Creation Date Estimation
│   │   ├── index.ts                # Main runner (estimatePhotoDateModule.ts)
│   │   ├── photoDateEstimate.ts    # Consensus solver
│   │   ├── photoDateEstimateShared.ts
│   │   └── photoDateEstimateFilenameHeuristics.ts
│   │
│   ├── extractEmbeddedMetadata/    # Local EXIF/IPTC/XMP parsing
│   │   ├── index.ts                # Main runner (extractEmbeddedMetadataModule.ts)
│   │   └── embeddedMetadata.ts     # sharp + exif-parser parsing
│   │
│   └── previews/                   # Thumbnail and Preview Downscaling
│       ├── index.ts                # Main runner (generatePreviewsModule.ts)
│       └── previewAdapterModule.ts
│
└── workflowRuntime/                # Core Workflow Orchestrator
    ├── contracts.ts                # Module/Workflow interfaces and definitions
    ├── orchestrator.ts             # Runtime execution loop
    ├── moduleRegistry.ts           # Module registry logic
    ├── workflowRegistry.ts
    └── workflows/                  # Workflow definitions (e.g. folderIngestWorkflow.ts)
```

---

## 2. Decoupling Database Operations (Core Service Layer)

Currently, modules like `generateAiMetadataModule.ts` run inline SQLite SQL statements (e.g., querying `assets`, `assets_manual`, deleting/inserting `review_items`). To enable pluggability, modules must **not** run raw SQL.

Instead, the core runtime context should inject high-level, database-agnostic repository interfaces.

### Example IPhotoMetadataRepository Interface

```typescript
export interface IPhotoMetadataRepository {
    hasBlock(assetId: string, sourceKind: string): Promise<boolean>;
    insertBlock(params: {
        assetId: string;
        sourceKind: string;
        provider: string;
        modelVersion: string;
        block: PhotoMetadataBlock;
    }): Promise<string>;
    saveProjection(projection: PhotoMetadataProjectionInput): Promise<void>;
}
```

### Decoupled Module Implementation

Inside `generateAiMetadata/index.ts`, the database calls are refactored to use the injected repositories:

```typescript
// BEFORE (coupled to SQL):
const row = db.prepare(`SELECT a.id, a.original_path, ...`).get(assetId);

// AFTER (decoupled):
const asset = await coreServices.assets.getAssetForAnalysis(context.subject.subjectId);
```

---

## 3. Integrating Zod v4 for Pluggable Validation

Zod v4 can validate two major boundaries in a pluggable module architecture:

1. **Module Parameters Schema**: Each module declares a Zod schema defining the inputs it accepts. The orchestrator validates runtime parameters before launching the module.
2. **Standardized Core Outputs**: The core defines Zod schemas for the artifacts that modules produce (e.g., AI Metadata blocks), ensuring that third-party outputs match exact requirements.

### Declaring Module Parameters using Zod

```typescript
// src/services/modules/generateAiMetadata/schema.ts
import { z } from 'zod';

export const AiMetadataParamsSchema = z.object({
    aiMode: z.enum(['live', 'mock', 'off']).default('off'),
    metadataPass: z.enum(['scout', 'refine']).default('scout'),
    imageStrategy: z.enum(['overview_only', 'overview_plus_tiles']).default('overview_only'),
});

export type AiMetadataParams = z.infer<typeof AiMetadataParamsSchema>;
```

### Standardizing Core Output Schemas

```typescript
// src/services/workflowRuntime/contracts.ts
import { z } from 'zod';

export const PhotoMetadataBlockSchema = z.object({
    caption: z.string().nullable(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    keywords: z.array(z.string()),
    // Additional domain fields...
});
```

### Updating Module Registry for Schemas

We can extend `ModuleDefinition` to support Zod validations:

```typescript
export type ModuleDefinition<TParams = any> = {
    id: string;
    version: number;
    capability: CapabilityClass;
    accepts: string[];
    produces: ModuleOutputDefinition[];
    parameterSchema?: z.ZodType<TParams>; // Validate inputs at runtime
    run: (context: RuntimeModuleContext & { validatedParams: TParams }) => Promise<RuntimeModuleRunResult>;
};
```

---

## 4. Migration Plan

1. **Phase 1: File Reorganisation**: Move files into the new self-contained directory structures. Correct the import paths across the codebase.
2. **Phase 2: Repository Abstraction**: Refactor `src/services/photoMetadata/repository.ts` and `src/services/tags/tagRepository.ts` into a decoupled service layer.
3. **Phase 3: Runtime Parameter Schemas**: Integrate Zod schemas into the workflow runtime and register modules using their parameter schemas.
