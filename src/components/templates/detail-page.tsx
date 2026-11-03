import type { DetailDraft } from "../../lib/generation/schema";
export type DetailSection = DetailDraft["sections"][number];
export type TemplateProps = { section: DetailSection; photoUrl: string | null };
export function Highlight({ text }: { text: string }) {
  return <>{text.split(/(\[확인 필요:[^\]]*\])/g).map((part, index) => part.startsWith("[확인 필요:") ? <mark key={index}>{part}</mark> : part)}</>;
}
function Photo({ section, photoUrl }: TemplateProps) {
  return photoUrl ? /* eslint-disable-next-line @next/next/no-img-element */
    <img className="detail-photo" src={photoUrl} alt={section.imageGuide || section.headline} /> : <div className="detail-placeholder"><Highlight text={section.imageGuide || "이 섹션에 사용할 내 사진을 선택해 주세요."} /></div>;
}
function Copy({ section }: TemplateProps) { return <><h2><Highlight text={section.headline} /></h2>{section.body && <p><Highlight text={section.body} /></p>}</>; }
function Bullets({ section }: TemplateProps) { return <ul>{section.bullets.map((bullet, index) => <li key={index}><Highlight text={bullet} /></li>)}</ul>; }
export function Hero(props: TemplateProps) { return <><Copy {...props} /><Photo {...props} /><Bullets {...props} /></>; }
export function ImageText(props: TemplateProps) { return <><Photo {...props} /><Copy {...props} /><Bullets {...props} /></>; }
export function FeatureList(props: TemplateProps) { return <><Copy {...props} /><Bullets {...props} /><Photo {...props} /></>; }
export function SpecTable(props: TemplateProps) { return <><Copy {...props} /><table><tbody>{props.section.bullets.map((bullet, index) => { const colon = bullet.indexOf(":"); return <tr key={index}>{colon < 0 ? <td colSpan={2}><Highlight text={bullet} /></td> : <><th scope="row"><Highlight text={bullet.slice(0, colon)} /></th><td><Highlight text={bullet.slice(colon + 1).trim()} /></td></>}</tr>; })}</tbody></table><Photo {...props} /></>; }
export function Notice(props: TemplateProps) { return <><Copy {...props} /><Bullets {...props} /><Photo {...props} /></>; }
export function Cta(props: TemplateProps) { return <><Copy {...props} /><Bullets {...props} /><Photo {...props} /></>; }
const renderers = { hero: Hero, "image-text": ImageText, "feature-list": FeatureList, "spec-table": SpecTable, notice: Notice, cta: Cta };
export function DetailPage({ sections, photoUrls = {} }: { sections: DetailSection[]; photoUrls?: Record<number, string> }) {
  return <div data-detail-page className="detail-page">{sections.map(section => { const Template = renderers[section.template]; return <section key={section.id} className={`detail-section detail-${section.template}`}><Template section={section} photoUrl={section.imageSlot === null ? null : photoUrls[section.imageSlot] ?? null} /></section>; })}</div>;
}
