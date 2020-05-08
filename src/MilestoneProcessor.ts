import * as core from '@actions/core';
import * as github from '@actions/github';
import {Octokit} from '@octokit/rest';
import moment from 'moment';
import {
  Issue,
  Milestone,
  GlobalMilestone,
  GLOBAL_MILESTONES_MAP
} from './constants';

type OctoKitMilestoneList = Octokit.Response<
  Octokit.IssuesListMilestonesForRepoResponse
>;
type OctoKitMilestone = Octokit.Response<Octokit.IssuesCreateMilestoneResponse>;

type IssuesCreateMilestoneParams = Octokit.IssuesCreateMilestoneParams;

const OPERATIONS_PER_RUN = 100;
const MIN_ISSUES_IN_MILESTONE = 3;
const SHORTEST_SPRINT_LENGTH_IN_DAYS = 2;
const NUMBER_OF_WEEKS_OUT_TO_MAKE_MILESTONES = 8;
const NUMBER_OF_WEEKS_IN_CYCLE = 16;

const DAYS_IN_WEEK = 7;

export interface MilestoneProcessorOptions {
  repoToken: string;
  debugOnly: boolean;
}

export interface MilestoneCreationParams {
  title: string;
  description: string;
}

/***
 * Handle processing of milestones.
 */
export class MilestoneProcessor {
  readonly client: github.GitHub;
  readonly options: MilestoneProcessorOptions;
  private operationsLeft: number = 0;
  private currentGlobalMilestoneIds: GlobalMilestone['id'][];
  private milestoneTitleToGlobalMilestoneIdMap: Map<
    Milestone['title'],
    GlobalMilestone['id']
  >;
  private milestonesToAdd: any[];
  private now: moment.Moment;

  readonly closedIssues: Issue[] = [];
  readonly closedMilestones: Milestone[] = [];

  constructor(
    options: MilestoneProcessorOptions,
    getMilestones?: (page: number) => Promise<Milestone[]>,
    now?: moment.Moment
  ) {
    this.options = options;
    this.operationsLeft = OPERATIONS_PER_RUN;
    this.client = new github.GitHub(options.repoToken);
    this.currentGlobalMilestoneIds = [];
    this.milestonesToAdd = [];
    this.milestoneTitleToGlobalMilestoneIdMap = new Map<
      Milestone['title'],
      GlobalMilestone['id']
    >();
    this.now = now || moment.utc();
    core.info(`Checking milestones at ${this.now.toISOString()}`);

    // For testing.
    if (getMilestones) {
      this.getMilestones = getMilestones;
    }

    if (this.options.debugOnly) {
      core.warning(
        'Executing in debug mode. Debug output will be written but no milestones will be processed.'
      );
    }

    // Seed map
    for (const globalMilestone of GLOBAL_MILESTONES_MAP.values()) {
      const title = _getMilestoneTitle(globalMilestone);
      this.milestoneTitleToGlobalMilestoneIdMap.set(title, globalMilestone.id);
    }
  }

  // Process a page of milestones.
  // TODO: Make iterative.
  async processMilestones(page: number = 1): Promise<any> {
    if (this.operationsLeft <= 0) {
      core.warning('Reached max number of operations to process. Exiting.');
      return 0;
    }

    // Get the next batch of milestones
    const milestones: Milestone[] = await this.getMilestones(page);
    this.operationsLeft -= 1;

    if (milestones.length > 0) {
      // Go through milestones
      for (const milestone of milestones.values()) {
        // Build list of upcoming global milestones that already exist.
        this._addMilestone(milestone);

        await this._processMilestoneIfNeedsClosing(milestone);
      }

      // do the next batch
      return this.processMilestones(page + 1);
    } else {
      // Once you've gotten all the milestones, assert that the right global
      // milestones are there.
      await this._assertMilestones();

      core.info('No more milestones found to process. Exiting.');
      return {
        operationsLeft: this.operationsLeft,
        milestonesToAdd: this.milestonesToAdd
      };
    }
  }

  private async _processMilestoneIfNeedsClosing(milestone: Milestone) {
    if (milestone.state === 'closed') {
      return;
    }

    const totalIssues =
      (milestone.open_issues || 0) + (milestone.closed_issues || 0);
    const {number, title} = milestone;
    const updatedAt = milestone.updated_at;
    const openIssues = milestone.open_issues;

    core.info(
      `Found milestone: milestone #${number} - ${title} last updated ${updatedAt}`
    );

    if (totalIssues < MIN_ISSUES_IN_MILESTONE) {
      core.info(
        `Skipping closing ${title} because it has less than ${MIN_ISSUES_IN_MILESTONE} issues`
      );
      return;
    }
    if (openIssues > 0) {
      core.info(`Skipping closing ${title} because it has open issues/prs`);
      return;
    }
    // Close instantly because there isn't a good way to tag milestones
    // and do another pass.
    return await this.closeMilestone(milestone);
  }

  // Enforce list of global milestones.
  private async _assertMilestones() {
    core.info('Asserting milestones');
    const globalMilestonesLeft: GlobalMilestone[] = [];

    for (const globalMilestone of GLOBAL_MILESTONES_MAP.values()) {
      if (!this.currentGlobalMilestoneIds.includes(globalMilestone.id)) {
        globalMilestonesLeft.push(globalMilestone);
      }
    }

    core.info(
      `Global milestones left: ${globalMilestonesLeft
        .map(m => m.id)
        .join(', ')}`
    );

    // If there are possible milestones to add.
    if (globalMilestonesLeft.length > 0) {
      // Calculate milestones that are coming up soon and are not already
      // created.
      const globalMilestonesIdsLeftToNearestDueDateMap = new Map<
        GlobalMilestone['id'],
        moment.Moment
      >();

      // Seed map of global milestones with upcoming due dates.
      for (const globalMilestone of globalMilestonesLeft.values()) {
        const nearestDueDate = this._getUpcomingDueDate(globalMilestone);
        if (nearestDueDate) {
          globalMilestonesIdsLeftToNearestDueDateMap.set(
            globalMilestone.id,
            nearestDueDate
          );
        }
      }

      // Build the list of params for the milestones to add.
      for (const globalMilestoneId of globalMilestonesIdsLeftToNearestDueDateMap.keys()) {
        const globalMilestone = GLOBAL_MILESTONES_MAP.get(globalMilestoneId);
        if (globalMilestone) {
          const nearestDueDate = globalMilestonesIdsLeftToNearestDueDateMap.get(
            globalMilestoneId
          );
          if (nearestDueDate) {
            const milestoneToAdd = this._buildMilestone(
              globalMilestone,
              nearestDueDate
            );
            core.info(`Milestone to add: ${milestoneToAdd.title}`);
            this.milestonesToAdd.push(milestoneToAdd);
          }
        }
      }

      core.info(`# milestones to add: ${this.milestonesToAdd.length}`);

      // If debug, don't actually create the milestones.
      if (this.options.debugOnly) {
        return;
      }

      // Create the milestones.
      for (const milestone of this.milestonesToAdd.values()) {
        await this.createMilestone({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          title: milestone.title,
          description: milestone.description,
          due_on: milestone.due_on
        });
      }
    }
  }

  private _buildMilestone(
    globalMilestone: GlobalMilestone,
    dueDate?: moment.Moment
  ) {
    return {
      title: _getMilestoneTitle(globalMilestone),
      description:
        'Generated by [Memorable Milestones](https://github.com/instantish/memorable-milestones)',
      due_on: dueDate && dueDate.toISOString()
    };
  }

  // Get issues from github in baches of 100
  private async getMilestones(page: number): Promise<Milestone[]> {
    const milestoneResult: OctoKitMilestoneList = await this.client.issues.listMilestonesForRepo(
      {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        per_page: 100,
        page
      }
    );

    return milestoneResult.data;
  }

  // Create milestone
  private async createMilestone(
    params: IssuesCreateMilestoneParams
  ): Promise<any> {
    const milestoneResult: OctoKitMilestone = await this.client.issues.createMilestone(
      params
    );

    return milestoneResult.data;
  }

  /// Close an milestone
  private async closeMilestone(milestone: Milestone): Promise<void> {
    core.info(`Closing milestone #${milestone.number} - ${milestone.title}`);

    this.closedMilestones.push(milestone);

    if (this.options.debugOnly) {
      return;
    }

    await this.client.issues.updateMilestone({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      milestone_number: milestone.number,
      state: 'closed'
    });
  }

  // Get nearest due date within 8 weeks.
  private _getUpcomingDueDate(globalMilestone: GlobalMilestone) {
    const initialDueDate = globalMilestone.firstDueDate;

    // Hacky because I don't want to do this with calculation because of
    // leap years etc.
    // TODO: Make better.
    for (let i = 0; i < 100; i++) {
      const nearestDueDate =
        i === 0
          ? initialDueDate
          : initialDueDate
              .clone()
              .add(1 * i * NUMBER_OF_WEEKS_IN_CYCLE, 'weeks');
      const daysUntilNearestDueDate = nearestDueDate.diff(this.now, 'days');
      // If the due date is between 2 days from now and 8 weeks, eligible to add.
      if (
        daysUntilNearestDueDate > SHORTEST_SPRINT_LENGTH_IN_DAYS &&
        daysUntilNearestDueDate <
          NUMBER_OF_WEEKS_OUT_TO_MAKE_MILESTONES * DAYS_IN_WEEK
      ) {
        return nearestDueDate;
      } else if (
        daysUntilNearestDueDate >
        (NUMBER_OF_WEEKS_IN_CYCLE + NUMBER_OF_WEEKS_OUT_TO_MAKE_MILESTONES) *
          DAYS_IN_WEEK
      ) {
        return;
      }
    }
    return;
  }

  // Add to list of current global milestones.
  _addMilestone(milestone: Milestone) {
    const dueOn = milestone.due_on && moment(milestone.due_on);
    if (!dueOn || (dueOn && dueOn.isAfter(this.now))) {
      // Don't record past milestones or milestones without due dates, so they're
      // not recreated.
      const globalMilestoneId = this.milestoneTitleToGlobalMilestoneIdMap.get(
        milestone.title
      );

      core.info(`Checking global milestone: ${globalMilestoneId}`);

      if (
        globalMilestoneId &&
        !this.currentGlobalMilestoneIds.includes(globalMilestoneId)
      ) {
        this.currentGlobalMilestoneIds.push(globalMilestoneId);
      }
    } else {
      return;
    }
  }
}

function _getMilestoneTitle(globalMilestone: GlobalMilestone) {
  return `${globalMilestone.emoji}  ${globalMilestone.name}`;
}
