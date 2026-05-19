"use client";

import dynamic from 'next/dynamic';

const TrafficClient = dynamic(() => import('../../components/TrafficClient'), { ssr: false });

export default function TrafficRoutePage() {
  return <TrafficClient />;
}
