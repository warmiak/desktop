import { Middleware, Dispatch } from 'redux'

import { Repository, nameOf } from '../../../models/repository'
import { Account } from '../../../models/account'

import { fatalError } from '../../fatal-error'
import { INewAppState } from '../../app-state'

import { PullRequestUpdater } from '../helpers/pull-request-updater'
import { GitHubRepository } from '../../../models/github-repository'
import { PullRequest } from '../../../models/pull-request'
import { Actions, ActionTypes } from '../app-store'

export function createPullRequestUpdaterMiddleware(
  getAccountForRepository: (repository: Repository) => Account | null,
  fetchAndCachePullRequests: (repository: Repository, account: Account) => void,
  fetchPullRequestsFromCache: (
    repository: GitHubRepository
  ) => Promise<ReadonlyArray<PullRequest>>,
  fetchPullRequestStatuses: (
    gitHubRepository: GitHubRepository,
    account: Account
  ) => void
) {
  let currentPullRequestUpdater: PullRequestUpdater | null = null

  function stopPullRequestUpdater() {
    const updater = currentPullRequestUpdater

    if (updater) {
      updater.stop()
      currentPullRequestUpdater = null
    }
  }

  function startPullRequestUpdater(repository: Repository) {
    if (currentPullRequestUpdater !== null) {
      fatalError(
        `A pull request updater is already active and cannot start updating on ${nameOf(
          repository
        )}`
      )

      return
    }

    if (!repository.gitHubRepository) {
      return
    }

    const account = getAccountForRepository(repository)
    if (account === null) {
      return
    }

    const updater = new PullRequestUpdater(
      repository,
      account,
      fetchAndCachePullRequests,
      fetchPullRequestsFromCache,
      fetchPullRequestStatuses
    )

    updater.start()
    currentPullRequestUpdater = updater
  }

  function inspectAction(action: Actions) {
    if (currentPullRequestUpdater === null) {
      return
    }

    if (action.type !== ActionTypes.AddPullRequestToDatabase) {
      return
    }

    const currentGitHubRepository =
      currentPullRequestUpdater.repository.gitHubRepository
    if (currentGitHubRepository == null) {
      return
    }

    if (
      currentGitHubRepository.endpoint === action.repository.endpoint &&
      currentGitHubRepository.fullName === action.repository.fullName
    ) {
      currentPullRequestUpdater.didPushPullRequest(action.pullRequest)
    }
  }

  const pullRequestUpdaterMiddleware: Middleware<{}, INewAppState> = api => (
    next: Dispatch
  ) => action => {
    inspectAction(action)

    const before = api.getState().selectedRepository

    // Call the next dispatch method in the middleware chain.
    const returnValue = next(action)

    const after = api.getState().selectedRepository

    if (before != null && after != null && before.id == after.id) {
      // the selected repository has not changed
      return
    }

    stopPullRequestUpdater()

    const hasChanged = true

    if (hasChanged && after instanceof Repository) {
      startPullRequestUpdater(after)
    }

    return returnValue
  }

  return pullRequestUpdaterMiddleware
}
