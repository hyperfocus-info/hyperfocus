"""Offline regression tests: python -m unittest scripts.test_compress."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from . import benchmark, compress
from .validate import validate


class CompressionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="caveman-test-")
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name) / "source.md"
        self.original = b"# Instructions\r\n\r\nPlease retain `bun test` exactly.\r\n"
        self.source.write_bytes(self.original)

    def test_failed_repair_never_changes_source(self):
        with patch.object(compress, "call_claude", side_effect=["bad", RuntimeError("offline")]):
            with self.assertRaises(RuntimeError):
                compress.compress_file(self.source)
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertEqual(list(self.source.parent.iterdir()), [self.source])

    def test_success_retains_byte_exact_backup(self):
        with patch.object(compress, "call_claude", return_value="# Instructions\n\nRetain `bun test`.\n"):
            self.assertTrue(compress.compress_file(self.source))
        self.assertEqual(self.source.with_name("source.original.md").read_bytes(), self.original)

    def test_invalid_utf8_fails_without_inference_or_writes(self):
        self.source.write_bytes(b"bad\xff")
        with patch.object(compress, "call_claude") as infer:
            with self.assertRaises(UnicodeDecodeError):
                compress.compress_file(self.source)
            infer.assert_not_called()
        self.assertEqual(self.source.read_bytes(), b"bad\xff")

    def test_concurrent_edit_is_not_overwritten(self):
        def infer(_prompt):
            self.source.write_text("New user content", encoding="utf-8")
            return self.original.decode("utf-8")
        with patch.object(compress, "call_claude", side_effect=infer):
            with self.assertRaisesRegex(RuntimeError, "Source changed"):
                compress.compress_file(self.source)
        self.assertEqual(self.source.read_text(), "New user content")

    def test_protected_content_changes_fail(self):
        candidate = self.source.with_name("candidate.md")
        for original, changed in [
            ("# A\nText", "# B\nText"),
            ("Use ./app/file.ts", "Use ./app/other.ts"),
            ("Run `bun test`", "Run `bun run`"),
            ("---\nname: example\n---\nBody", "---\nname: other\n---\nBody"),
            ("```ts\nconst x = 1;", "```ts\nconst x = 2;"),
            ("Keep this instruction", ""),
        ]:
            with self.subTest(original=original):
                self.source.write_text(original, encoding="utf-8")
                candidate.write_text(changed, encoding="utf-8")
                self.assertFalse(validate(self.source, candidate).is_valid)

    def test_missing_tokenizer_never_reports_word_counts_as_tokens(self):
        with patch.object(benchmark, "_enc", None):
            with self.assertRaisesRegex(RuntimeError, "requires tiktoken"):
                benchmark.count_tokens("several words")

    def test_cli_inference_has_deadline_and_hidden_windows_flag(self):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}), patch.object(compress.subprocess, "run") as run:
            run.return_value.stdout = "Compressed prose"
            self.assertEqual(compress.call_claude("Prompt"), "Compressed prose")
            self.assertEqual(run.call_args.kwargs["timeout"], 120)
            self.assertIn("creationflags", run.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
