import AnalyzePage from "./input-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return <AnalyzePage isDemo={process.env.AI_CLIENT === "fake"} />;
}
