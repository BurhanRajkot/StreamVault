import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { Check, X, Loader2, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Footer } from '@/components/Footer'
import { useToast } from '@/hooks/use-toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

interface SubscriptionRequest {
  id: string
  user_id: string
  email: string
  plan_id: string
  amount: number
  currency: string
  transaction_id: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export default function AdminDashboard() {
  const [requests, setRequests] = useState<SubscriptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchRequests()
  }, [])

  const fetchRequests = async () => {
    try {
      const res = await fetch(`${API_URL}/subscriptions/admin/requests`)
      if (!res.ok) throw new Error('Failed to fetch requests')
      const data = await res.json()
      setRequests(data)
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to load subscription requests',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (requestId: string, action: 'approve' | 'reject') => {
    setProcessingId(requestId)
    try {
      const res = await fetch(`${API_URL}/subscriptions/admin/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      })

      if (!res.ok) throw new Error(`Failed to ${action} request`)

      toast({
        title: `Request ${action === 'approve' ? 'Approved' : 'Rejected'}`,
        description: `Successfully processed the subscription request`,
      })

      // Refresh list
      fetchRequests()
    } catch (err) {
      toast({
        title: 'Action Failed',
        description: `Could not ${action} the request. Please try again.`,
        variant: 'destructive',
      })
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <>
      <Helmet>
        <title>Admin Dashboard - StreamVault</title>
      </Helmet>

      <div className="min-h-screen flex flex-col bg-background">
        <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
            <h1 className="text-xl font-bold">Admin Dashboard</h1>
            <Link to="/">
              <Button variant="ghost" size="sm">Back to Home</Button>
            </Link>
          </div>
        </header>

        <main className="flex-1 py-10 px-4">
          <div className="mx-auto max-w-7xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold">Subscription Requests</h2>
              <Button onClick={fetchRequests} variant="outline" size="sm">
                Refresh
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-20 border rounded-xl bg-card/50">
                <p className="text-muted-foreground">No pending requests</p>
              </div>
            ) : (
              <div className="border rounded-xl bg-card overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User Email</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(request.created_at).toLocaleDateString()}
                          <br />
                          <span className="text-xs">{new Date(request.created_at).toLocaleTimeString()}</span>
                        </TableCell>
                        <TableCell className="font-medium">{request.email || request.user_id}</TableCell>
                        <TableCell>
                            <Badge variant="outline" className={request.plan_id === 'premium' ? 'border-violet-500 text-violet-500' : ''}>
                                {request.plan_id.toUpperCase()}
                            </Badge>
                        </TableCell>
                        <TableCell>₹{request.amount}</TableCell>
                        <TableCell className="font-mono text-xs">{request.transaction_id}</TableCell>
                        <TableCell>
                          <Badge variant={
                            request.status === 'approved' ? 'default' :
                            request.status === 'rejected' ? 'destructive' : 'secondary'
                          }>
                            {request.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === 'pending' && (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 w-8 p-0"
                                onClick={() => handleAction(request.id, 'reject')}
                                disabled={processingId === request.id}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700"
                                onClick={() => handleAction(request.id, 'approve')}
                                disabled={processingId === request.id}
                              >
                                {processingId === request.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                                ) : (
                                    <Check className="h-4 w-4 text-white" />
                                )}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
