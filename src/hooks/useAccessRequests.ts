import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { approveAccessRequest, deleteAccessRequest, fetchAccessRequests } from '@/lib/api'

export const ACCESS_REQUESTS_QUERY_KEY = ['admin-access-requests'] as const

/**
 * The admin's queue of Premium access requests (asked from the app), with
 * approve and delete. Shared by the website's dashboard and the app's.
 */
export function useAccessRequests(enabled = true) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ACCESS_REQUESTS_QUERY_KEY,
    queryFn: fetchAccessRequests,
    enabled,
    retry: false,
    refetchInterval: 60_000,
  })

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: ACCESS_REQUESTS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  }

  const approve = useMutation({
    mutationFn: approveAccessRequest,
    onSuccess: () => {
      toast.success('Approved — Premium is on for that account, in the app')
      settle()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not approve'),
  })

  const remove = useMutation({
    mutationFn: deleteAccessRequest,
    onSuccess: () => {
      toast.success('Request deleted')
      settle()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not delete'),
  })

  const requests = query.data?.requests ?? []
  return {
    ...query,
    requests,
    repo: query.data?.repo ?? 'BurhanRajkot/StreamVault',
    pending: requests.filter((r) => r.status === 'pending').length,
    approve,
    remove,
    /** userId the approve/delete in flight is for. */
    busyFor: approve.isPending ? approve.variables : remove.isPending ? remove.variables : undefined,
  }
}
