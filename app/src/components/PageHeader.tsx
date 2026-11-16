import type { ReactNode } from 'react'
import { LargeTitle, NavBar } from './kit'

export { EmptyState } from './kit'

/**
 * A screen's header, as on iOS: a large title in the page, and on a phone a
 * navigation bar (back, actions) that takes the title over once it scrolls away.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  backTo = '/me',
  actions,
  barActions,
}: {
  title: string
  subtitle?: ReactNode
  back?: boolean
  backTo?: string
  /** Beside the large title. */
  actions?: ReactNode
  /** In the phone's navigation bar. */
  barActions?: ReactNode
}) {
  return (
    <>
      <NavBar title={title} back={back} backTo={backTo} actions={barActions} />
      <LargeTitle title={title} subtitle={subtitle} actions={actions} />
    </>
  )
}
