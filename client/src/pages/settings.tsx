import { useState, useEffect } from 'react';
import { getGistToken, setGistToken, getGistId, setGistId, loadLocalData, saveLocalData, syncFromGist, syncToGist } from '@/lib/gist-storage';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const [token, setToken] = useState('');
  const [gistId, setGistIdState] = useState('');
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setToken(getGistToken() || '');
    setGistIdState(getGistId() || '');
  }, []);

  const handleSave = () => {
    setGistToken(token);
    setGistId(gistId);
    toast({ title: 'Settings saved', description: 'GitHub Gist sync configured.' });
  };

  const handleSyncFrom = async () => {
    setSyncing(true);
    const data = await syncFromGist();
    if (data) {
      saveLocalData(data);
      toast({ title: 'Synced from Gist', description: 'Data loaded from GitHub Gist.' });
    } else {
      toast({ title: 'Sync failed', description: 'Check your token and Gist ID.', variant: 'destructive' });
    }
    setSyncing(false);
  };

  const handleSyncTo = async () => {
    setSyncing(true);
    const data = loadLocalData();
    const ok = await syncToGist(data);
    if (ok) {
      toast({ title: 'Synced to Gist', description: 'Data pushed to GitHub Gist.' });
    } else {
      toast({ title: 'Sync failed', description: 'Check your token and Gist ID.', variant: 'destructive' });
    }
    setSyncing(false);
  };

  const handleExport = () => {
    const data = loadLocalData();
    const rows = [
      ['Date', 'Demon', 'Note', 'Cost'],
      ...data.logs.map(l => {
        const d = data.demons.find(x => x.id === l.demonId);
        return [l.timestamp.slice(0, 10), d?.name || l.demonId, l.note, l.cost];
      }),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demon-finder-backup-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: 'CSV backup downloaded.' });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-lg mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-red-400">Settings</h1>

        <div className="bg-gray-900 rounded-xl p-5 space-y-4 border border-gray-800">
          <h2 className="text-lg font-semibold text-gray-200">GitHub Gist Sync</h2>
          <div>
            <label className="text-sm text-gray-400">Personal Access Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="ghp_..."
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400">Gist ID</label>
            <input
              type="text"
              value={gistId}
              onChange={e => setGistIdState(e.target.value)}
              placeholder="abc123..."
              className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm"
            />
          </div>
          <button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-2 text-sm font-medium">
            Save Settings
          </button>
          <div className="flex gap-2">
            <button onClick={handleSyncFrom} disabled={syncing} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm">
              {syncing ? 'Syncing...' : 'Pull from Gist'}
            </button>
            <button onClick={handleSyncTo} disabled={syncing} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 text-sm">
              {syncing ? 'Syncing...' : 'Push to Gist'}
            </button>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Data Backup</h2>
          <button onClick={handleExport} className="w-full bg-green-700 hover:bg-green-600 text-white rounded-lg py-2 text-sm font-medium">
            Export CSV Backup
          </button>
        </div>

        <div className="text-center text-xs text-gray-600">
          <a href="/" className="text-gray-500 hover:text-gray-300">Back to Dashboard</a>
        </div>
      </div>
    </div>
  );
}