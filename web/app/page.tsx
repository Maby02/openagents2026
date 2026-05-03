"use client";

import { useEventStream } from "@/lib/useEventStream";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { StatsStrip } from "./components/StatsStrip";
import { EventTicker } from "./components/EventTicker";
import { StrategiesGrid } from "./components/StrategiesGrid";
import { RecentShares } from "./components/RecentShares";
import { HowItWorks } from "./components/HowItWorks";
import { DataCorpus } from "./components/DataCorpus";
import { PaymentSplit } from "./components/PaymentSplit";
import { ThreePillars } from "./components/ThreePillars";
import { RunANode } from "./components/RunANode";
import { Footer } from "./components/Footer";

const OBSERVER_URL = process.env.NEXT_PUBLIC_OBSERVER_URL ?? "http://127.0.0.1:9099";

export default function Page() {
  const { events, status, totalSeen } = useEventStream({ observerUrl: OBSERVER_URL });

  return (
    <main className="min-h-screen flex flex-col">
      <Header status={status} totalSeen={totalSeen} />

      <Hero events={events} />
      <StatsStrip events={events} />

      {/* Live data — the centerpiece */}
      <section className="border-b border-ink-800">
        <div className="max-w-[1280px] mx-auto px-6 py-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <EventTicker events={events} />
          </div>
          <div className="space-y-6 min-w-0">
            <StrategiesGrid events={events} />
            <RecentShares events={events} />
          </div>
        </div>
      </section>

      {/* Editorial value-prop frame */}
      <HowItWorks />
      <DataCorpus events={events} />
      <PaymentSplit />
      <ThreePillars />
      <RunANode />

      <Footer />
    </main>
  );
}
