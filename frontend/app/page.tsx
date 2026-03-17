export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation Bar - NetSuite Style */}
      <nav className="bg-primary h-14 border-b border-border flex items-center px-6">
        <div className="flex items-center gap-8">
          <h1 className="text-white font-bold text-xl">SUNSET ERP</h1>
          <div className="flex gap-6 text-sm">
            <a href="#" className="text-white/90 hover:text-white">Home</a>
            <a href="#" className="text-white/90 hover:text-white">Activities</a>
            <a href="#" className="text-white/90 hover:text-white">Sales</a>
            <a href="#" className="text-white/90 hover:text-white">Financial</a>
            <a href="#" className="text-white/90 hover:text-white">Reports</a>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <input 
            type="search" 
            placeholder="Search..." 
            className="bg-primary-foreground/10 border border-white/20 rounded px-3 py-1.5 text-sm text-white placeholder:text-white/60"
          />
          <div className="text-white text-sm">Larry Nelson</div>
        </div>
      </nav>

      {/* Breadcrumbs */}
      <div className="bg-muted border-b border-border px-6 py-3">
        <div className="text-sm text-muted-foreground">
          Home &gt; Dashboard
        </div>
      </div>

      {/* Main Content */}
      <main className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI Card */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-muted-foreground text-sm mb-1">Revenue</div>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold text-foreground">$524,890</div>
              <div className="text-success text-sm mb-1 flex items-center">
                <span>↑ 11.9%</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-muted-foreground text-sm mb-1">Expenses</div>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold text-foreground">$438,891</div>
              <div className="text-danger text-sm mb-1 flex items-center">
                <span>↑ 9.3%</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-muted-foreground text-sm mb-1">Cash Flow</div>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold text-foreground">$143,221</div>
              <div className="text-muted-foreground text-sm mb-1">
                <span>N/A</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-muted-foreground text-sm mb-1">Bank Balance</div>
            <div className="flex items-end gap-2">
              <div className="text-3xl font-bold text-foreground">$1,011,896</div>
              <div className="text-success text-sm mb-1 flex items-center">
                <span>↑ 16.5%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Welcome Message */}
        <div className="mt-6 bg-card border border-border rounded-lg p-8 text-center">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            🎉 Welcome to Sunset ERP! 🎉
          </h2>
          <p className="text-muted-foreground text-lg mb-6">
            Your complete Enterprise Resource Planning system is ready!
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <div className="text-2xl mb-2">📊</div>
              <div className="text-sm font-medium text-foreground">16 Modules</div>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
              <div className="text-2xl mb-2">🔌</div>
              <div className="text-sm font-medium text-foreground">113+ APIs</div>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4">
              <div className="text-2xl mb-2">🗄️</div>
              <div className="text-sm font-medium text-foreground">55 Tables</div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <div className="text-2xl mb-2">✅</div>
              <div className="text-sm font-medium text-foreground">Production Ready</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
