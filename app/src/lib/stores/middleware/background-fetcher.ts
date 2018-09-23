import { Middleware, Dispatch } from 'redux'

import { Repository } from '../../../models/repository'
import { Account } from '../../../models/account'
import { FetchType } from '../../../models/fetch'

import { fatalError } from '../../fatal-error'
import { INewAppState } from '../../app-state'

import { BackgroundFetcher } from '../helpers/background-fetcher'

export function createBackgroundFetcherMiddleware(
  getAccountForRepository: (repository: Repository) => Account | null,
  shouldBackgroundFetch: (repository: Repository) => boolean,
  performFetch: (
    repository: Repository,
    account: Account,
    fetchType: FetchType
  ) => Promise<void>
) {
  let currentBackgroundFetcher: BackgroundFetcher | null = null

  function stopBackgroundFetching() {
    const backgroundFetcher = currentBackgroundFetcher
    if (backgroundFetcher) {
      backgroundFetcher.stop()
      log.debug(`disposing old background fetcher`)

      currentBackgroundFetcher = null
    }
  }

  function startBackgroundFetching(
    repository: Repository,
    withInitialSkew: boolean
  ) {
    if (currentBackgroundFetcher != null) {
      fatalError(
        `We should only have on background fetcher active at once, but we're trying to start background fetching on ${
          repository.name
        } while another background fetcher is still active!`
      )
      return
    }

    const account = getAccountForRepository(repository)
    if (account === null) {
      return
    }

    if (repository.gitHubRepository === null) {
      return
    }

    log.debug(`creating new background fetcher`)

    // Todo: add logic to background checker to check the API before fetching
    // similar to what's being done in `refreshAllIndicators`
    const fetcher = new BackgroundFetcher(
      repository,
      account,
      r => performFetch(r, account, FetchType.BackgroundTask),
      r => shouldBackgroundFetch(r)
    )
    fetcher.start(withInitialSkew)
    currentBackgroundFetcher = fetcher
  }

  const backgroundFetcherManager: Middleware<{}, INewAppState> = api => (
    next: Dispatch
  ) => action => {
    const before = api.getState().selectedRepository

    // Call the next dispatch method in the middleware chain.
    const returnValue = next(action)

    const after = api.getState().selectedRepository

    if (before != null && after != null && before.id == after.id) {
      // the selected repository has not changed
      return
    }

    stopBackgroundFetching()

    const hasChanged = true

    if (hasChanged && after instanceof Repository) {
      startBackgroundFetching(after, before != null)
    }

    return returnValue
  }

  return backgroundFetcherManager
}
