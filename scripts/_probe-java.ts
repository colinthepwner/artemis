export function javaReport(tag: string): string {
  return `\tprivate static boolean report(String name, boolean ok, String detail) {
\t\tif (ok) {
\t\t\tSystem.out.println("${tag} PASS " + name);
\t\t} else {
\t\t\tSystem.out.println("${tag} FAIL " + name + " :: " + detail);
\t\t}
\t\treturn ok;
\t}`
}

export function javaNames(opts: { onMissingI18n: string; detail: string }): string {
  return `\tprivate static void names() {
\t\tObject i18n;
\t\ttry {
\t\t\ti18n = net.minecraft.core.lang.I18n.getInstance();
\t\t} catch (Throwable t) {
${opts.onMissingI18n}
\t\t\treturn;
\t\t}
\t\tfor (String key : LANG_KEYS) {
\t\t\ttry {
\t\t\t\tObject translated = i18n.getClass().getMethod("translateKey", String.class).invoke(i18n, key);
\t\t\t\tString text = String.valueOf(translated);
\t\t\t\t// Translating to the KEY is always the bug: that is the raw
\t\t\t\t// \`tile.mymod.thing.desc\` a player would read in the tooltip.
\t\t\t\t// Translating to EMPTY is only a bug when the export meant to put
\t\t\t\t// something there. For a description nobody has written, the export
\t\t\t\t// writes a blank ON PURPOSE, because the choice is between a blank
\t\t\t\t// line and the key rather than between a line and nothing; see
\t\t\t\t// tileLangLines. Language.translateKey returns whatever
\t\t\t\t// Properties.getProperty gives it, which for \`key=\` is the empty
\t\t\t\t// string rather than a fall through to the missing-key path, so a
\t\t\t\t// blank really does come out blank in game.
\t\t\t\tboolean blank = false;
\t\t\t\tfor (String b : LANG_BLANK) {
\t\t\t\t\tif (b.equals(key)) {
\t\t\t\t\t\tblank = true;
\t\t\t\t\t\tbreak;
\t\t\t\t\t}
\t\t\t\t}
\t\t\t\tcheck("name " + key, !key.equals(text) && (blank || text.length() > 0), "${opts.detail}");
\t\t\t} catch (Throwable t) {
\t\t\t\tcheck("name " + key, false, String.valueOf(t));
\t\t\t}
\t\t}
\t}`
}
