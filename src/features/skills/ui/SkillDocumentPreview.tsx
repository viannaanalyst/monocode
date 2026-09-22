import { MarkdownDocumentPreview } from "../../sessions/ui/MarkdownDocumentPreview";
import { t } from "../../../i18n";

/** Keep the skill's YAML header readable without interpreting it as Markdown. */
export function SkillDocumentPreview({ text }: { text: string }) {
  return <MarkdownDocumentPreview text={text} metadataLabel={t("Skill metadata")} />;
}
