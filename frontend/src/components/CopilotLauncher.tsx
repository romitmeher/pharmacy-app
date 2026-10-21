'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Bot } from 'lucide-react';

const Copilot = dynamic(() => import('./AICopilotDrawer'), { ssr: false, loading: () => <button disabled className="aicopilotdrawer-1" aria-busy="true">Opening Copilot…</button> });
export default function CopilotLauncher() {
  const [activated, setActivated] = useState(false);
  return activated ? <Copilot initialOpen /> : <button aria-label="Ask Pharmacy Copilot" className="aicopilotdrawer-1" onClick={() => setActivated(true)}><Bot size={18} /><span>Ask Pharmacy Copilot</span></button>;
}
