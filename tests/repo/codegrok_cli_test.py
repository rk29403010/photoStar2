import importlib.util
import pathlib
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "tooling" / "scripts" / "repo" / "codegrok_cli.py"


def load_module():
    spec = importlib.util.spec_from_file_location("codegrok_cli", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class CodeGrokCliConfigTests(unittest.TestCase):
    def test_query_defaults_to_repo_src(self):
        module = load_module()

        args = module.parse_args(["query", "--question", "date inference"])

        self.assertEqual(args.command, "query")
        self.assertEqual(args.path, str(REPO_ROOT / "src"))
        self.assertEqual(args.question, "date inference")
        self.assertEqual(args.n_results, 10)

    def test_stats_uses_repo_src_default_path(self):
        module = load_module()

        args = module.parse_args(["stats"])

        self.assertEqual(args.command, "stats")
        self.assertEqual(args.path, str(REPO_ROOT / "src"))


if __name__ == "__main__":
    unittest.main()
