import { useAuth } from "../contexts/AuthContext"
import { Container } from "../components/ui/container"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import { Badge } from "../components/ui/badge"
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar"
import { Link } from "react-router-dom"
import { SiGoogle } from "@icons-pack/react-simple-icons"

// Hero content for unauthenticated users
const UnauthenticatedHome = () => {
  const { login, error } = useAuth()

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.18),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(147,51,234,0.14),transparent_60%),linear-gradient(140deg,rgba(2,6,23,0.85),rgba(15,23,42,0.92))]" />
      </div>
      <div className="relative z-10">
        {/* Navigation */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex-1"></div>
            <Button
              onClick={login}
              variant="outline"
              className="gap-2 border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-sm"
            >
              <SiGoogle className="h-4 w-4" title="Google logo" />
              Continue with Google
            </Button>
          </div>
        </Container>
      </header>

      {/* Hero Section */}
      <section className="relative py-24 sm:py-32">
        <Container>
          <div className="mx-auto max-w-4xl text-center">
            <Badge variant="secondary" className="mb-6">
              Professional Trading Platform
            </Badge>
            
            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl">
              Equity Analytics
              <br />
              <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                Reimagined
              </span>
            </h1>
            
            <p className="mb-8 text-xl text-muted-foreground max-w-2xl mx-auto">
              Professional-grade market intelligence for discretionary traders and portfolio managers. 
              Research, analyze, and execute with institutional-quality tools.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Button
                onClick={login}
                size="lg"
                className="min-w-[220px] gap-2 border-primary/50 bg-primary/15 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-md shadow-primary/20"
                variant="outline"
              >
                <SiGoogle className="h-5 w-5" title="Google logo" />
                Continue with Google
              </Button>
              
              {error && (
                <div className="text-sm text-rose-300">
                  {error.message}
                </div>
              )}
            </div>
          </div>
        </Container>
      </section>

      {/* Feature Highlights */}
      <section className="py-16 bg-muted/40">
        <Container>
          <div className="grid gap-8 md:grid-cols-3">
            <Card className="border-border/50">
              <CardHeader>
                <div className="mb-2 h-12 w-12 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <CardTitle>Equity Insight</CardTitle>
                <CardDescription>
                  AI-powered analysis with valuation models, earnings projections, and trade recommendations
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <div className="mb-2 h-12 w-12 rounded-lg bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <CardTitle>Chart Analysis</CardTitle>
                <CardDescription>
                  Technical analysis with pattern recognition, support/resistance levels, and momentum indicators
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border/50">
              <CardHeader>
                <div className="mb-2 h-12 w-12 rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <CardTitle>Real-time Intelligence</CardTitle>
                <CardDescription>
                  Live market data, news flow analysis, and institutional-grade research tools
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </Container>
      </section>
      </div>
    </div>
  )
}

// Dashboard for authenticated users  
const AuthenticatedHome = () => {
  const { user, logout } = useAuth()

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(56,189,248,0.18),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,0.14),transparent_60%),radial-gradient(circle_at_10%_85%,rgba(236,72,153,0.12),transparent_60%),linear-gradient(150deg,rgba(2,6,23,0.85),rgba(15,23,42,0.94))]" />
      </div>
      <div className="relative z-10">
        {/* Navigation */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex-1"></div>
            
            <div className="flex items-center gap-4">
              <Avatar className="h-8 w-8">
                {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                <AvatarFallback>
                  {user?.name?.split(' ').map(n => n[0]).join('') ?? 'U'}
                </AvatarFallback>
              </Avatar>
              
              <div className="text-sm">
                <div className="font-medium">{user?.name}</div>
                <div className="text-muted-foreground">{user?.email}</div>
              </div>
              
              <Button onClick={logout} variant="outline" size="sm">
                Logout
              </Button>
            </div>
          </div>
        </Container>
      </header>

      {/* Dashboard */}
      <section className="py-12">
        <Container>
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Welcome back, {user?.name?.split(' ')[0]}</h1>
            <p className="text-muted-foreground">Choose your analysis tool to get started</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3 max-w-5xl">
            {/* Equity Insight Card */}
            <Card className="group cursor-pointer transition-all hover:shadow-lg border-border/50 hover:border-blue-500/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
                    <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <Badge variant="secondary">AI-Powered</Badge>
                </div>
                <CardTitle className="group-hover:text-blue-600 transition-colors">
                  Equity Insight
                </CardTitle>
                <CardDescription>
                  Deep fundamental analysis with AI-powered valuations, earnings projections, and institutional-grade research reports.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Latest analysis generated 2h ago
                  </div>
                  <Link to="/equity-insight">
                    <Button className="group-hover:bg-blue-600 group-hover:text-white">
                      Enter
                      <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Chart Analysis Card */}
            <Card className="group cursor-pointer transition-all hover:shadow-lg border-border/50 hover:border-green-500/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center">
                    <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                  <Badge variant="secondary">Technical</Badge>
                </div>
                <CardTitle className="group-hover:text-green-600 transition-colors">
                  Chart Analysis  
                </CardTitle>
                <CardDescription>
                  Advanced technical analysis with pattern recognition, key levels identification, and momentum-based trade signals.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Ready for new analysis
                  </div>
                  <Button className="group-hover:bg-green-600 group-hover:text-white">
                    Enter
                    <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Trading Agents Card */}
            <Card className="group cursor-pointer transition-all hover:shadow-lg border-border/50 hover:border-cyan-500/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-700 flex items-center justify-center">
                    <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m-7 8h8a2 2 0 002-2V8a2 2 0 00-2-2h-5l-3 3v7a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <Badge variant="secondary">New</Badge>
                </div>
                <CardTitle className="group-hover:text-cyan-500 transition-colors">
                  Trading Agents Command Center
                </CardTitle>
                <CardDescription>
                  Configure analyst personas, stream LangGraph stages, and review trading decisions in a dedicated workspace.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Manual runs with live progress updates
                  </div>
                  <Link to="/trading-agents">
                    <Button className="group-hover:bg-cyan-500 group-hover:text-black">
                      Enter
                      <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats or Recent Activity could go here */}
          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              Need help getting started? <Button variant="link" className="p-0 h-auto">View documentation</Button>
            </p>
          </div>
        </Container>
      </section>
      </div>
    </div>
  )
}

const Home = () => {
  const { status } = useAuth()

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return status === 'authenticated' ? <AuthenticatedHome /> : <UnauthenticatedHome />
}

export default Home
