"use strict";
'use client';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Dashboard;
const react_1 = __importStar(require("react"));
const lucide_react_1 = require("lucide-react");
function Dashboard() {
    const [runs, setRuns] = (0, react_1.useState)([]);
    (0, react_1.useEffect)(() => {
        // In a real app, fetch from API
        setRuns([
            { id: '1', goal: 'User can log in', status: 'passed', startedAt: new Date().toISOString(), duration: 45000 },
            { id: '2', goal: 'Checkout flow', status: 'failed', startedAt: new Date().toISOString(), duration: 120000 },
        ]);
    }, []);
    return (<div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <span className="text-blue-500">✈</span> TestPilot
          </h1>
          <p className="text-slate-400 mt-1">Autonomous QA Dashboard</p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
          <lucide_react_1.Play size={18}/> Run New Test
        </button>
      </header>

      <main>
        <div className="grid gap-4">
          <h2 className="text-lg font-semibold text-slate-300 mb-2">Recent Runs</h2>
          {runs.map(run => (<div key={run.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between hover:border-slate-700 transition-colors">
              <div className="flex items-center gap-4">
                {run.status === 'passed' ? (<lucide_react_1.CheckCircle2 className="text-emerald-500"/>) : (<lucide_react_1.XCircle className="text-rose-500"/>)}
                <div>
                  <div className="font-medium text-white">{run.goal}</div>
                  <div className="text-sm text-slate-500 flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1"><lucide_react_1.Clock size={14}/> {(run.duration / 1000).toFixed(1)}s</span>
                    <span>{new Date(run.startedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <button className="text-slate-400 hover:text-white flex items-center gap-1 text-sm font-medium">
                View Details <lucide_react_1.ExternalLink size={14}/>
              </button>
            </div>))}
        </div>
      </main>
    </div>);
}
