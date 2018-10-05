import { Repository } from '../../models/repository'

function getIgnoreExistingUpstreamRemoteKey(repository: Repository): string {
  return `repository/${repository.id}/ignoreExistingUpstreamRemote`
}

export function getIgnoreExistingUpstreamRemote(
  repository: Repository
): Promise<boolean> {
  const key = getIgnoreExistingUpstreamRemoteKey(repository)
  const value = localStorage.getItem(key)
  return Promise.resolve(value === '1')
}

export function ignoreExistingUpstreamRemote(
  repository: Repository
): Promise<void> {
  const key = getIgnoreExistingUpstreamRemoteKey(repository)
  localStorage.setItem(key, '1')

  return Promise.resolve()
}
