'use client';

import React, { useState, useEffect } from 'react';
import { Play, CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react';

export default function Dashboard() {
  const [runs, setRuns] = useState<any[]>([]);

  useEffect(() => {
    // In a real app, fetch from API
    setRuns([
      { id: '1', goal: 'User can log in', status: 'passed', startedAt: new Date().toISOString(), duration: 45000 },
      { id: '2', goal: 'Checkout flow', status: 'failed', startedAt: new Date().toISOString(), duration: 120000 },
    ]);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="text-blue-500">✈</span> TestPilot
          </h1>
          <p className="text-slate-400 mt-1">Autonomous QA Dashboard</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
          <Play size={18} /> Run New Test
        </button>
      </header>

      <main>
        <div className="grid gap-4">
          <h2 className="text-lg font-semibold text-slate-300 mb-2">Recent Runs</h2>
          {runs.map(run => (
            <div key={run.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-4">
                {run.status === 'passed' ? (
                  <CheckCircle2 className="text-emerald-500" />
                ) : (
                  <XCircle className="text-rose-500" />
                )}
                <div>
                  <div className="font-medium text-white">{run.goal}</div>
                  <div className="text-sm text-slate-500 flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1"><Clock size={14} /> {(run.duration / 1000).toFixed(1)}s</span>
                    <span>{new Date(run.startedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <button className="text-slate-400 hover:text-white flex items-center gap-1 text-sm font-medium">
                View Details <ExternalLink size={14} />
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
