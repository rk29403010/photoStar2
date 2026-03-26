from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_TARGET_PATH = REPO_ROOT / "src"
DEFAULT_EMBEDDING_MODEL = "coderankembed"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Repo-local CodeGrok CLI wrapper for indexing and querying.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    index_parser = subparsers.add_parser("index", help="Build or rebuild a CodeGrok index.")
    add_common_index_options(index_parser)

    load_parser = subparsers.add_parser("load", help="Validate that an existing index can be loaded.")
    add_common_runtime_options(load_parser)

    stats_parser = subparsers.add_parser("stats", help="Show CodeGrok index statistics.")
    add_common_runtime_options(stats_parser)

    query_parser = subparsers.add_parser("query", help="Run a semantic query against an existing index.")
    add_common_runtime_options(query_parser)
    query_parser.add_argument("--question", required=True, help="Natural-language search query.")
    query_parser.add_argument("--n-results", type=int, default=10, help="Maximum number of results to show.")
    query_parser.add_argument("--language", help="Optional language filter, for example 'typescript'.")
    query_parser.add_argument("--symbol-type", help="Optional symbol type filter, for example 'function'.")

    return parser


def add_common_index_options(parser: argparse.ArgumentParser) -> None:
    add_common_runtime_options(parser)
    parser.add_argument(
        "--extensions",
        help="Comma-separated extension list, for example '.ts,.tsx,.js,.md'.",
    )


def add_common_runtime_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--path",
        default=str(DEFAULT_TARGET_PATH),
        help=f"Target path to index or query. Defaults to {DEFAULT_TARGET_PATH}.",
    )
    parser.add_argument(
        "--embedding-model",
        default=DEFAULT_EMBEDDING_MODEL,
        help=f"Embedding model name. Defaults to {DEFAULT_EMBEDDING_MODEL}.",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text output.")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = build_parser()
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    target_path = Path(args.path).resolve()

    try:
        result = dispatch_command(args, target_path)
    except Exception as exc:  # noqa: BLE001
        print(f"CodeGrok CLI error: {exc}", file=sys.stderr)
        return 1

    emit_result(result, as_json=args.json)
    return 0


def dispatch_command(args: argparse.Namespace, target_path: Path) -> dict[str, Any]:
    if args.command == "index":
        return run_index(
            target_path=target_path,
            embedding_model=args.embedding_model,
            extensions=parse_extensions(args.extensions),
        )
    if args.command == "load":
        return run_load(target_path=target_path, embedding_model=args.embedding_model)
    if args.command == "stats":
        return run_stats(target_path=target_path, embedding_model=args.embedding_model)
    if args.command == "query":
        return run_query(
            target_path=target_path,
            embedding_model=args.embedding_model,
            question=args.question,
            n_results=args.n_results,
            language=args.language,
            symbol_type=args.symbol_type,
        )
    raise ValueError(f"Unsupported command: {args.command}")


def parse_extensions(raw_extensions: str | None) -> list[str] | None:
    if not raw_extensions:
        return None
    return [item.strip() for item in raw_extensions.split(",") if item.strip()]


def create_retriever(target_path: Path, embedding_model: str):
    from codegrok_mcp.indexing.source_retriever import SourceRetriever

    retriever = SourceRetriever(
        codebase_path=str(target_path),
        persist_path=str(target_path / ".codegrok" / "chroma"),
        embedding_model=embedding_model,
        verbose=False,
    )
    return retriever


def metadata_path_for(target_path: Path) -> Path:
    return target_path / ".codegrok" / "metadata.json"


def run_index(target_path: Path, embedding_model: str, extensions: list[str] | None) -> dict[str, Any]:
    retriever = create_retriever(target_path, embedding_model)
    retriever.index_codebase(file_extensions=extensions)
    metadata_path = metadata_path_for(target_path)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    retriever.save_metadata(str(metadata_path))
    return {
        "command": "index",
        "path": str(target_path),
        "metadata_path": str(metadata_path),
        "stats": retriever.get_stats(),
    }


def run_load(target_path: Path, embedding_model: str) -> dict[str, Any]:
    retriever = create_retriever(target_path, embedding_model)
    loaded = retriever.load_existing_index()
    if not loaded:
        raise RuntimeError(f"No existing CodeGrok index found for {target_path}")

    metadata = retriever.load_metadata(str(metadata_path_for(target_path)))
    return {
        "command": "load",
        "path": str(target_path),
        "loaded": loaded,
        "stats": retriever.get_stats(),
        "metadata_found": metadata is not None,
    }


def run_stats(target_path: Path, embedding_model: str) -> dict[str, Any]:
    return run_load(target_path=target_path, embedding_model=embedding_model) | {"command": "stats"}


def run_query(
    target_path: Path,
    embedding_model: str,
    question: str,
    n_results: int,
    language: str | None,
    symbol_type: str | None,
) -> dict[str, Any]:
    retriever = create_retriever(target_path, embedding_model)
    if not retriever.load_existing_index():
        raise RuntimeError(f"No existing CodeGrok index found for {target_path}")
    retriever.load_metadata(str(metadata_path_for(target_path)))

    documents, sources = retriever.get_sources_for_question(
        question=question,
        n_results=n_results,
        language=language,
        symbol_type=symbol_type,
    )

    results = [
        {
            "source": source,
            "filepath": document["metadata"].get("filepath"),
            "line": document["metadata"].get("line"),
            "name": document["metadata"].get("name"),
            "type": document["metadata"].get("type"),
        }
        for source, document in zip(sources, documents)
    ]

    return {
        "command": "query",
        "path": str(target_path),
        "question": question,
        "results": results,
    }


def emit_result(result: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(result, indent=2))
        return

    command = result.get("command")
    if command in {"load", "stats", "index"}:
        print(f"command: {command}")
        print(f"path: {result['path']}")
        stats = result.get("stats", {})
        for key in ("total_files", "total_symbols", "total_chunks", "parse_errors", "indexing_time"):
            if key in stats:
                print(f"{key}: {stats[key]}")
        if "metadata_path" in result:
            print(f"metadata_path: {result['metadata_path']}")
        if "metadata_found" in result:
            print(f"metadata_found: {result['metadata_found']}")
        return

    if command == "query":
        print(f"question: {result['question']}")
        if not result["results"]:
            print("No results.")
            return
        for item in result["results"]:
            print(item["source"])
        return

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
