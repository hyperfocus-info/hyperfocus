

export const patch = (file: string) => `diff --git a/${file} b/${file}\nindex aaaa..bbbb 100644\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+new\n`;
