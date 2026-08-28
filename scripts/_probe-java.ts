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
\t\t\t\tcheck("name " + key, !key.equals(text) && text.length() > 0, "${opts.detail}");
\t\t\t} catch (Throwable t) {
\t\t\t\tcheck("name " + key, false, String.valueOf(t));
\t\t\t}
\t\t}
\t}`
}
