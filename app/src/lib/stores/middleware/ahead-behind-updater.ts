import { Middleware, Dispatch } from 'redux'

import { Repository } from '../../../models/repository'

import { fatalError } from '../../fatal-error'
import { INewAppState } from '../../app-state'

import { AheadBehindUpdater } from '../helpers/ahead-behind-updater'
import { ComparisonCache } from '../../comparison-cache'
import { CloningRepository } from '../../../models/cloning-repository'
import { Actions, ActionTypes } from '../app-store'

function hasRepositoryChanged(
  before: Repository | CloningRepository | null,
  after: Repository | CloningRepository | null
) {
  return (
    (before && after && before.hash !== after.hash) ||
    (before && !after) ||
    (!before && after)
  )
}

export function createAheadBehindUpdaterMiddleware(
  onCacheUpdated: (repository: Repository, cache: ComparisonCache) => void
) {
  let currentAheadBehindUpdater: AheadBehindUpdater | null = null

  function stopAheadBehindUpdater() {
    const updater = currentAheadBehindUpdater

    if (updater != null) {
      updater.stop()
      log.debug(`disposing old ahead/behind updater`)
      currentAheadBehindUpdater = null
    }
  }

  function startAheadBehindUpdater(
    repository: Repository,
    onCacheUpdated: (repository: Repository, cache: ComparisonCache) => void
  ) {
    if (currentAheadBehindUpdater != null) {
      fatalError(
        `An ahead/behind updater is already active and cannot start updating on ${
          repository.name
        }`
      )

      return
    }

    log.debug(`creating new ahead/behind updater`)

    const updater = new AheadBehindUpdater(repository, onCacheUpdated)

    updater.start()

    currentAheadBehindUpdater = updater
  }

  function inspectAction(action: Actions) {
    if (currentAheadBehindUpdater === null) {
      return
    }

    if (
      action.type === ActionTypes.InsertAheadBehindComparison &&
      currentAheadBehindUpdater.repository.id === action.repository.id
    ) {
      const { from, to, aheadBehind } = action
      currentAheadBehindUpdater.insert(from, to, aheadBehind)
    }
    if (
      action.type === ActionTypes.ScheduleAheadBehindComparisons &&
      currentAheadBehindUpdater !== null &&
      currentAheadBehindUpdater.repository.id === action.repository.id
    ) {
      const {
        currentBranch,
        defaultBranch,
        recentBranches,
        allBranches,
      } = action
      currentAheadBehindUpdater.schedule(
        currentBranch,
        defaultBranch,
        recentBranches,
        allBranches
      )
    }
    if (
      action.type === ActionTypes.ClearPendingAheadBehindComparisons &&
      currentAheadBehindUpdater !== null &&
      currentAheadBehindUpdater.repository.id === action.repository.id
    ) {
      currentAheadBehindUpdater.clear()
    }
  }

  const aheadBehindUpdateMiddleware: Middleware<
    Dispatch<Actions>,
    INewAppState
  > = api => (next: Dispatch<Actions>) => action => {
    inspectAction(action)

    const before = api.getState().selectedRepository

    // Call the next dispatch method in the middleware chain.
    const returnValue = next(action)

    const after = api.getState().selectedRepository

    if (!hasRepositoryChanged(before, after)) {
      // the selected repository has not changed
      return
    }

    stopAheadBehindUpdater()

    if (after instanceof Repository) {
      startAheadBehindUpdater(after, onCacheUpdated)
    }

    return returnValue
  }

  return aheadBehindUpdateMiddleware
}
