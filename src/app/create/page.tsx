import CreatePage from "./input-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return <CreatePage isDemo={process.env.AI_CLIENT === "fake"} />;
}
