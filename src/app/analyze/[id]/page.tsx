"use client";
import { use } from "react";
import { ReportView } from "../../../components/report-view";
export default function ReportPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <ReportView id={id} />; }
