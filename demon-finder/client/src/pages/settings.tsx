import { useState } from "react";
import { getToken, setToken, clearToken, validateToken, getLocalCache, loadFromGist, saveToGist } from "@/lib/gist-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Skull, ArrowLeft, Key, CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function Settings() {
  const { toast } = useToast();
  const [tokenInput, setTokenInput] = useState("");
  const [validating, setValidating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const currentToken = getToken();

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setValidating(true);
    const valid = await validateToken(tokenInput.trim());
    setValidating(false);

    if (valid) {
      setToken(tokenInput.trim());
      setTokenInput("");
      toast({ title: "Connected", description: "GitHub token saved. Your data will now sync to a private Gist." });
      // Trigger initial sync
      setSyncing(true);
      const data = getLocalCache();
      await saveToGist(data);
      setSyncing(false);
      toast({ title: "Synced", description: "Data pushed to Gist." });
    } else {
      toast({ title: "Invalid token", description: "Could not authenticate with GitHub. Check the token and try again.", variant: "destructive" });
    }
  };

  const handleDisconnect = () => {
    clearToken();
    toast({ title: "Disconnected", description: "GitHub token removed. Data remains in browser." });
  };

  const handleForceSync = async () => {
    setSyncing(true);
    await loadFromGist();
    setSyncing(false);
    toast({ title: "Synced", description: "Data pulled from Gist." });
  };

  const handleForcePush = async () => {
    setSyncing(true);
    const data = getLocalCache();
    await saveToGist(data);
    setSyncing(false);
    toast({ title: "Pushed", description: "Local data pushed to Gist." });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 px-4 py-4 sm:px-6">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" data-testid="button-back">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Skull className="w-5 h-5 text-red-500" />
            <h1 className="text-lg font-bold tracking-tight">Settings</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Card className="border-border/60 bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">GitHub Gist Sync</h2>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Connect a GitHub Personal Access Token to sync your demon data to a private Gist.
            This lets you access the same data from any browser/PC.
          </p>

          {currentToken ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Connected</span>
                <span className="text-muted-foreground text-xs">({currentToken.slice(0, 8)}...)</span>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={handleForceSync} disabled={syncing} className="text-xs" data-testid="button-pull">
                  {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                  Pull from Gist
                </Button>
                <Button size="sm" variant="ghost" onClick={handleForcePush} disabled={syncing} className="text-xs" data-testid="button-push">
                  Push to Gist
                </Button>
                <Button size="sm" variant="ghost" onClick={handleDisconnect} className="text-xs text-destructive hover:text-destructive" data-testid="button-disconnect">
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <XCircle className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Not connected</span>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  1. Go to{" "}
                  <a href="https://github.com/settings/tokens/new?scopes=gist&description=Demon+Finder" target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline inline-flex items-center gap-1">
                    GitHub Token Settings <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
                <p className="text-xs text-muted-foreground">2. Select only the <code className="bg-muted px-1 rounded text-[11px]">gist</code> scope</p>
                <p className="text-xs text-muted-foreground">3. Generate and paste the token below</p>
              </div>

              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveToken(); }}
                  className="text-xs font-mono bg-background"
                  data-testid="input-token"
                />
                <Button size="sm" onClick={handleSaveToken} disabled={!tokenInput.trim() || validating} className="bg-red-600 hover:bg-red-700 text-white text-xs" data-testid="button-save-token">
                  {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect"}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="border-border/60 bg-card p-6">
          <h2 className="text-sm font-semibold mb-2">How it works</h2>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li>Your data is always saved in the browser (localStorage) for instant access.</li>
            <li>When connected, changes are automatically synced to a private GitHub Gist.</li>
            <li>On a new PC, connect with the same token and pull your data.</li>
            <li>The token is stored only in your browser, never in the source code.</li>
            <li>Works offline — changes sync to Gist when you're back online.</li>
          </ul>
        </Card>
      </main>

      <footer className="border-t border-border/40 mt-12 py-4 px-4">
        <div className="max-w-2xl mx-auto">
          <PerplexityAttribution />
        </div>
      </footer>
    </div>
  );
}
