"use client";

import dynamic from 'next/dynamic';

const SearchClient = dynamic(() => import('../../components/SearchClient'), { ssr: false });

export default function Page() {
  return <SearchClient />;
}
