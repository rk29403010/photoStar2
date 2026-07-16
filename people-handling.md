# Project Plan: People Handling Improvements (Detailed & Versioned)

Improve the capabilities for managing, identifying, and linking People in PhotoStar2, incorporating family tree uploads, duplicate prevention, version linking, automatic overlay linking, and advanced cross-navigation between people and trees.

## Project Type

- **WEB**: Tauri-based React + TypeScript desktop application.

## Success Criteria

1. **GEDCOM Support**: Users can upload `.ged` files, select a home person, and view the family tree (Traditional, Force, Fan, Line-Fan charts) adapted from the Kinship Explorer code.
2. **Consolidated Face/AI Overlay**: Local face recognition boxes and Gemini AI subject boxes on the same photo are automatically linked using overlap calculations (Overlap Coefficient > 0.70) and presented as a consolidated list of unique people.
3. **Fuzzy Tree Matching**: Suggested candidates from the family tree are proposed for manual linkage using a combination of fuzzy name matching, gender, photo EXIF dates, estimated age, and home-person relationship proximity.
4. **Dates in People Tab**: The People tab cards display birth/death dates.
5. **Person Matches & Unmatching**: A Detail view lists all photo matches for a person (with larger thumbnails) and allows specific matches to be "unmatched" (isolated).
6. **Banded Face Certainty**: cos similarity threshold clustering has three bands: auto-match (>= 0.72), suggest match (0.60 to 0.72), and ignore (< 0.60).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons, and SVG-based graph visualization.
- **Backend (Core)**: Node.js (Tauri process wrapper), `better-sqlite3` database management, and `sharp` for image crop operations.
- **AI Models**: TensorFlow.js / MediaPipe (local face detection), local Face Embedding (cosine similarity clustering), and Gemini AI (remote multimodal analysis).

---

## 1. Database Schema Definitions

### [MODIFY] [dbSchema.ts](file:///c:/Users/robin/Projects/photoStar2/src/data/dbSchema.ts)

We will define two new tables and add the matching indexes.

#### Table Definition: `family_trees`

Tracks uploaded GEDCOM files. It prevents exact duplicates using `file_hash`, and supports grouping multiple revisions of the same tree via `tree_group_id`.

```sql
CREATE TABLE IF NOT EXISTS family_trees (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    gedcom_content TEXT NOT NULL,
    tree_group_id TEXT NOT NULL,       -- Group ID representing the same logical family tree
    version_label TEXT,                -- Parsed from GEDCOM header (e.g. date/time or software version)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### Table Definition: `people_gedcom_links`

A linking table supporting cases where a single person is defined in multiple tree files (e.g., father's side and mother's side files).

```sql
CREATE TABLE IF NOT EXISTS people_gedcom_links (
    person_id TEXT NOT NULL,
    gedcom_tree_id TEXT NOT NULL,
    gedcom_person_id TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (person_id, gedcom_tree_id, gedcom_person_id),
    FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE,
    FOREIGN KEY(gedcom_tree_id) REFERENCES family_trees(id) ON DELETE CASCADE
);
```

#### Updates to `MIGRATIONS` array

```typescript
export const MIGRATIONS = [
    // ... existing migrations
    "CREATE TABLE IF NOT EXISTS family_trees (id TEXT PRIMARY KEY, filename TEXT NOT NULL, file_hash TEXT NOT NULL UNIQUE, gedcom_content TEXT NOT NULL, tree_group_id TEXT NOT NULL, version_label TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS people_gedcom_links (person_id TEXT NOT NULL, gedcom_tree_id TEXT NOT NULL, gedcom_person_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (person_id, gedcom_tree_id, gedcom_person_id))",
    "ALTER TABLE face_assignments ADD COLUMN is_suggested INTEGER DEFAULT 0",
];
```

---

## 2. Backend Handlers & Ingestion Modules

### GEDCOM Commands Handler

We will register `gedcomCommands.ts` to manage upload validation, hashing, versions grouping, and links deletion.

#### Hashing & Version Detection on Upload

1. Compute the SHA-256 hash of the uploaded `.ged` string content. If the hash exists in `family_trees`, reject the upload as a duplicate.
2. Read the GEDCOM header metadata:
   - Search for tags like `1 GEDC` (GEDCOM version), `1 DATE` (creation date of file), or `1 SUBM` (submitter).
   - Extract a version label (e.g. `DATE 2026-06-24`).
3. Grouping Versions:
   - When uploading a file, query existing trees.
   - If a tree with a similar filename or overlapping root ancestral nodes exists, prompt the user: *"Is this a new version of [Existing Tree]?"*
   - If yes, assign the same `tree_group_id` as the existing tree. If no, generate a new `tree_group_id`.

#### Link Management Commands

- `link_person_to_gedcom`: Inserts a row into `people_gedcom_links`.
- `unlink_person_from_gedcom`: Deletes from `people_gedcom_links` for the given tree/person pair.

### Ingestion Workflow Integration (Subgoal 3.5)

Modify the `resolvePeopleModule` in [resolvePeopleModule.ts](file:///c:/Users/robin/Projects/photoStar2/src/services/workflowRuntime/modules/resolvePeopleModule.ts):

- During face clustering, compute cosine similarity between detection vectors and existing centroids:
  - **High Certainty ($\ge 0.72$)**: Link established automatically. Insert into `face_assignments` with `is_suggested = 0`.
  - **Medium Certainty ($0.60 \le \text{cos\_sim} < 0.72$)**: Link established but set for review. Insert into `face_assignments` with `is_suggested = 1`.
  - **Low Certainty ($< 0.60$)**: Link not established (ignore face in this iteration).

---

## 3. UI Views & Cross-Navigation

### Ingest Settings & Tree Maintenance

1. **Maintenance panel in Settings**:
   - List all `family_trees` grouped by `tree_group_id` showing versions and filenames.
   - Allow deleting a specific version or a tree group entirely.
   - Allow linking two trees under the same `tree_group_id` (indicating they are versions of the same tree).
2. **Ingest Options Modal**:
   - Displays dropdown list of trees grouped by logical name.
   - Saves choice to settings table key `'default_gedcom_tree_id'`.

### Cross-Navigation Controls

1. **From Tree Viewer to Photos**:
   - In the family tree charts (Traditional, Radial, Fan, Line-Fan), nodes that are linked to a PhotoStar profile display a subtle photo indicator or thumbnail badge.
   - Clicking the badge redirects the user to the library view, pre-filtering the gallery for that specific person (`person_any` filter).
2. **From Photos/People View to Tree**:
   - In the consolidated individual photo details panel (`PeopleTab.tsx`), linked people show their tree connection.
   - In the **Person Detail View**:
     - Display a list of linked family tree matches (e.g. *"Appears in Father's Side Tree as John Doe"*).
     - Clicking a link switches the view to the Family Tree tab, selects the tree version, sets the Home Person, and highlights/selects the corresponding node in the visual chart.

### Auto-Overlay Coalescing (Subgoal 2.2)

Update `buildSinglePhotoPeopleModel` to calculate the overlap coefficient between face and body bounding boxes:
$$\text{Overlap} = \frac{\text{Area of Intersection}}{\min(\text{Area of FaceBox}, \text{Area of AI Subject Box})}$$
If $>0.70$, coalesce the boxes into a single profile. Show both detection indicators (e.g., local face and Gemini AI icons) on the consolidated details panel.

---

## 4. Verification Plan

### Automated Tests

1. Run backend unit tests validating the overlap coefficient calculations:

   ```bash
   pnpm run test:core
   ```

2. Verify schema compilation:

   ```bash
   pnpm run typecheck
   ```

### Manual Verification

1. Upload the same GEDCOM file twice: verify the system blocks the duplicate.
2. Upload two different versions of a tree, verify they can be grouped together under a common tree group name.
3. Link a PhotoStar person to their counterpart in two different tree groups: confirm cross-navigation switches correctly between tree charts and photo galleries.
