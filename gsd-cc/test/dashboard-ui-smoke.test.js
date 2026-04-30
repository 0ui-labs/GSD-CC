const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dashboardDir = path.resolve(__dirname, '..', 'dashboard');
const appPath = path.join(dashboardDir, 'app.js');
const stylesPath = path.join(dashboardDir, 'styles.css');

function createModel(phase) {
  return {
    project: {
      name: 'Fixture Project'
    },
    current: {
      milestone: 'M001',
      slice: 'S01',
      task: 'T01',
      phase,
      next_action: `Handle ${phase}`
    },
    automation: {
      status: 'inactive',
      scope: 'slice',
      unit: null
    },
    progress: {
      slices: [
        {
          id: 'S01',
          name: 'Live browser connection',
          current: true,
          status: phase
        }
      ],
      acceptance_criteria: {
        passed: 1,
        pending: 2
      }
    },
    current_task: {
      id: 'S01-T01',
      name: 'Wire browser live connection',
      risk: {
        level: 'low'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: [
      {
        timestamp: '2026-04-29T08:30:00.000Z',
        type: 'task_started',
        category: 'task',
        severity: 'info',
        message: 'Task started'
      }
    ]
  };
}

function createEmptyModel() {
  return {
    project: {
      name: 'Empty Fixture',
      language: 'unknown',
      project_type: 'unknown',
      rigor: 'unknown',
      base_branch: 'unknown'
    },
    current: {
      milestone: 'unknown',
      slice: 'unknown',
      task: 'unknown',
      phase: 'no-project',
      next_action: 'Run /gsd-cc to initialize this project.'
    },
    automation: {
      status: 'inactive',
      scope: 'unknown',
      unit: null
    },
    progress: {
      slices: [],
      acceptance_criteria: {
        total: 0,
        passed: 0,
        pending: 0
      }
    },
    current_task: {
      id: 'unknown',
      name: 'unknown',
      risk: {
        level: 'unknown'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: []
  };
}

function createAttentionModel() {
  return {
    project: {
      name: 'Attention Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M001',
      slice: 'S01',
      task: 'T02',
      phase: 'apply-blocked',
      next_action: 'Resolve the blocker before continuing.'
    },
    automation: {
      status: 'approval-required',
      scope: 'slice',
      unit: 'S01/T02',
      pid: 99999999,
      started_at: '2026-04-29T08:00:00Z'
    },
    progress: {
      slices: [
        {
          id: 'S01',
          name: 'Attention states',
          current: true,
          status: 'blocked'
        }
      ],
      acceptance_criteria: {
        passed: 1,
        pending: 1
      }
    },
    current_task: {
      id: 'S01-T02',
      name: 'Handle attention states',
      risk: {
        level: 'high'
      },
      acceptance_criteria: []
    },
    attention: [
      {
        id: 'unify-required',
        severity: 'warning',
        title: 'UNIFY required',
        message: 'S01 is apply-complete but has no UNIFY report yet.',
        source: '.gsd/S01-UNIFY.md',
        recommended_action: 'Run UNIFY for S01 before moving on.'
      },
      {
        id: 'approval-required',
        severity: 'critical',
        title: 'Approval required',
        message: 'S01/T02 needs approval before auto-mode can continue.',
        source: '.gsd/APPROVAL-REQUEST.json',
        recommended_action: 'risk high meets approval_required_risk high'
      },
      {
        id: 'phase-apply-blocked',
        severity: 'warning',
        title: 'Phase blocked',
        message: 'apply-blocked requires attention for S01/T02.',
        source: '.gsd/STATE.md',
        recommended_action: 'Resolve the recorded blocker: Missing API credentials'
      },
      {
        id: 'auto-lock-stale',
        severity: 'critical',
        title: 'Auto-mode lock is stale',
        message: 'An auto-mode lock exists, but its PID is not running.',
        source: '.gsd/auto.lock',
        recommended_action: 'Review the last task state, then remove .gsd/auto.lock.'
      },
      {
        id: 'auto-recovery',
        severity: 'critical',
        title: 'Auto-mode stopped early',
        message: 'Auto-mode stopped: dispatch_failed.',
        source: '.gsd/auto-recovery.json',
        recommended_action: 'Inspect the log before resuming.'
      }
    ],
    activity: [],
    evidence: {
      approval_request: {
        slice: 'S01',
        task: 'T02',
        unit: 'S01/T02',
        plan: '.gsd/S01-T02-PLAN.xml',
        risk_level: 'high',
        risk_reason: 'Touches deployment configuration.',
        fingerprint: '123:456',
        reasons: [
          'risk high meets approval_required_risk high'
        ],
        created_at: '2026-04-29T08:01:00Z',
        source: '.gsd/APPROVAL-REQUEST.json'
      },
      latest_recovery: {
        status: 'problem',
        reason: 'dispatch_failed',
        message: 'Dispatch failed with exit 42 on S01/T02.',
        scope: 'slice',
        unit: 'S01/T02',
        phase: 'applying',
        dispatch_phase: 'apply',
        started_at: '2026-04-29T08:00:00Z',
        stopped_at: '2026-04-29T08:02:00Z',
        uncommitted_files: [
          'src/fixture.txt'
        ],
        log_file: '.gsd/auto.log',
        safe_next_action: 'Inspect the log before resuming.',
        source: '.gsd/auto-recovery.json',
        report: '.gsd/AUTO-RECOVERY.md'
      },
      latest_unify: null,
      recent_decisions: []
    }
  };
}

function createCurrentRunModel() {
  return {
    project: {
      name: 'Current Run Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M001',
      slice: 'S03',
      task: 'T04',
      phase: 'applying',
      task_name: 'Implement dashboard current run',
      next_action: 'Wait for S03/T04 to finish.',
      activity: {
        timestamp: '2026-04-29T08:45:00.000Z',
        type: 'dispatch_failed',
        category: 'dispatch',
        severity: 'warning',
        message: 'Apply dispatch failed.',
        unit: 'S03/T04',
        phase: 'applying',
        dispatch_phase: 'apply',
        source: '.gsd/events.jsonl',
        line: 8,
        artifact: '.gsd/AUTO-RECOVERY.md'
      }
    },
    automation: {
      status: 'active',
      scope: 'task',
      unit: 'S03/T04',
      pid: 4242,
      started_at: '2026-04-29T08:40:00.000Z'
    },
    progress: {
      slices: [],
      acceptance_criteria: {
        total: 0,
        passed: 0,
        pending: 0
      }
    },
    current_task: {
      id: 'S03-T04',
      name: 'Fallback task title',
      risk: {
        level: 'medium'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: [],
    evidence: {
      latest_recovery: {
        reason: 'dispatch_failed',
        dispatch_phase: 'apply',
        log_file: '.gsd/auto.log',
        report: '.gsd/AUTO-RECOVERY.md',
        source: '.gsd/auto-recovery.json'
      }
    }
  };
}

function createWhyTaskModel() {
  return {
    project: {
      name: 'Why Task Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M002',
      slice: 'S04',
      task: 'T05',
      phase: 'applying',
      task_name: 'Explain task rationale',
      next_action: 'Review the task plan rationale.'
    },
    automation: {
      status: 'inactive',
      scope: 'task',
      unit: 'S04/T05'
    },
    progress: {
      slices: [],
      acceptance_criteria: {
        total: 0,
        passed: 0,
        pending: 0
      }
    },
    current_task: {
      id: 'S04-T05',
      name: 'Explain task rationale',
      risk: {
        level: 'high',
        reason: 'Task plan fields must not be mixed with inferred reasoning.'
      },
      files: [],
      boundaries: [],
      acceptance_criteria: [
        {
          id: 'AC-4',
          text: 'Given a task plan exists\nWhen the dashboard renders\nThen action evidence is visible',
          status: 'pending'
        },
        {
          id: 'AC-5',
          text: 'Given verify commands exist\nWhen the dashboard renders\nThen commands are shown verbatim',
          status: 'passed'
        }
      ],
      action: [
        '1. Render the task action summary',
        '2. Show risk and covered ACs'
      ],
      verify: [
        'node test/dashboard-ui-smoke.test.js (AC-4, AC-5)'
      ],
      done: null,
      warnings: []
    },
    attention: [],
    activity: []
  };
}

function createActivityFeedModel() {
  return {
    project: {
      name: 'Activity Feed Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M003',
      slice: 'S05',
      task: 'T06',
      phase: 'applying',
      task_name: 'Render activity feed',
      next_action: 'Watch auto-mode progress.'
    },
    automation: {
      status: 'active',
      scope: 'task',
      unit: 'S05/T06',
      pid: 5150,
      started_at: '2026-04-29T08:00:00.000Z'
    },
    progress: {
      slices: [],
      acceptance_criteria: {
        total: 0,
        passed: 0,
        pending: 0
      }
    },
    current_task: {
      id: 'S05-T06',
      name: 'Render activity feed',
      risk: {
        level: 'medium'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: [
      {
        timestamp: '2026-04-29T08:06:00.000Z',
        type: 'state_validation_failed',
        category: 'error',
        severity: 'warning',
        message: 'State validation failed.',
        source: '.gsd/events.jsonl',
        line: 6,
        details: {
          reason: 'phase missing',
          attempts: 2
        },
        artifacts: [
          '.gsd/STATE.md'
        ]
      },
      {
        timestamp: '2026-04-29T08:05:00.000Z',
        type: 'approval_required',
        category: 'approval',
        severity: 'critical',
        message: 'Approval required for S05/T06.',
        unit: 'S05/T06',
        phase: 'applying',
        source: '.gsd/events.jsonl',
        line: 5,
        artifact: '.gsd/APPROVAL-REQUEST.json',
        artifacts: [
          '.gsd/APPROVAL-REQUEST.json',
          '.gsd/S05-T06-PLAN.xml'
        ],
        details: {
          risk_level: 'high'
        }
      },
      {
        timestamp: '2026-04-29T08:04:00.000Z',
        type: 'recovery_written',
        category: 'recovery',
        severity: 'warning',
        message: 'Recovery report written.',
        unit: 'S05/T06',
        phase: 'applying',
        source: '.gsd/events.jsonl',
        line: 4,
        artifact: '.gsd/AUTO-RECOVERY.md',
        details: {
          exit_code: '42'
        }
      },
      {
        timestamp: '2026-04-29T08:03:00.000Z',
        type: 'task_started',
        category: 'task',
        severity: 'info',
        message: 'Task S05/T06 started.',
        unit: 'S05/T06',
        phase: 'applying',
        source: '.gsd/events.jsonl',
        line: 3,
        artifact: '.gsd/S05-T06-PLAN.xml'
      },
      {
        timestamp: '2026-04-29T08:02:00.000Z',
        type: 'dispatch_started',
        category: 'dispatch',
        severity: 'info',
        message: 'Apply dispatch started.',
        unit: 'S05/T06',
        phase: 'applying',
        dispatch_phase: 'apply',
        source: '.gsd/events.jsonl',
        line: 2
      },
      {
        timestamp: '2026-04-29T08:01:00.000Z',
        type: 'auto_started',
        category: 'lifecycle',
        severity: 'info',
        message: 'Auto-mode started.',
        source: '.gsd/events.jsonl',
        line: 1
      }
    ]
  };
}

function createSliceRoadmapModel() {
  return {
    project: {
      name: 'Slice Roadmap Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M004',
      slice: 'S03',
      task: 'T02',
      phase: 'applying',
      task_name: 'Build slice roadmap',
      next_action: 'Review current slice progress.'
    },
    automation: {
      status: 'active',
      scope: 'slice',
      unit: 'S03'
    },
    progress: {
      acceptance_criteria: {
        total: 8,
        passed: 3,
        partial: 1,
        failed: 1,
        pending: 3
      },
      slices: [
        {
          id: 'S01',
          name: 'Pending discovery',
          current: false,
          status: 'pending',
          artifacts: {
            roadmap: '.gsd/M004-ROADMAP.md',
            plan: null,
            unify: null
          },
          acceptance_criteria: {
            total: 0,
            passed: 0,
            partial: 0,
            failed: 0,
            pending: 0
          },
          tasks: {
            total: 0,
            completed: 0,
            pending: 0,
            risk: {
              low: 0,
              medium: 0,
              high: 0,
              unknown: 0
            },
            items: []
          }
        },
        {
          id: 'S02',
          name: 'Planned foundation',
          current: false,
          status: 'planned',
          artifacts: {
            roadmap: '.gsd/M004-ROADMAP.md',
            plan: '.gsd/S02-PLAN.md',
            unify: null
          },
          acceptance_criteria: {
            total: 2,
            passed: 0,
            partial: 0,
            failed: 0,
            pending: 2
          },
          tasks: {
            total: 1,
            completed: 0,
            pending: 1,
            risk: {
              low: 1,
              medium: 0,
              high: 0,
              unknown: 0
            },
            items: [
              {
                id: 'T01',
                name: 'Plan the shell',
                status: 'pending',
                risk: {
                  level: 'low'
                },
                acceptance_criteria: {
                  total: 2
                }
              }
            ]
          }
        },
        {
          id: 'S03',
          name: 'Running dashboard roadmap',
          current: true,
          status: 'running',
          artifacts: {
            roadmap: '.gsd/M004-ROADMAP.md',
            plan: '.gsd/S03-PLAN.md',
            unify: null
          },
          acceptance_criteria: {
            total: 4,
            passed: 1,
            partial: 1,
            failed: 0,
            pending: 2
          },
          tasks: {
            total: 2,
            completed: 1,
            pending: 1,
            risk: {
              low: 0,
              medium: 1,
              high: 1,
              unknown: 0
            },
            items: [
              {
                id: 'T01',
                name: 'Render roadmap cards',
                status: 'complete',
                risk: {
                  level: 'medium'
                },
                acceptance_criteria: {
                  total: 2
                }
              },
              {
                id: 'T02',
                name: 'Build selectable detail',
                status: 'pending',
                risk: {
                  level: 'high'
                },
                acceptance_criteria: {
                  total: 2
                }
              }
            ]
          }
        },
        {
          id: 'S04',
          name: 'Final reconciliation',
          current: false,
          status: 'unified',
          artifacts: {
            roadmap: '.gsd/M004-ROADMAP.md',
            plan: '.gsd/S04-PLAN.md',
            unify: '.gsd/S04-UNIFY.md'
          },
          acceptance_criteria: {
            total: 2,
            passed: 2,
            partial: 0,
            failed: 0,
            pending: 0
          },
          tasks: {
            total: 1,
            completed: 1,
            pending: 0,
            risk: {
              low: 1,
              medium: 0,
              high: 0,
              unknown: 0
            },
            items: [
              {
                id: 'T01',
                name: 'Ship summary',
                status: 'complete',
                risk: {
                  level: 'low'
                },
                acceptance_criteria: {
                  total: 2
                }
              }
            ]
          }
        }
      ]
    },
    current_task: {
      id: 'S03-T02',
      name: 'Build slice roadmap',
      risk: {
        level: 'high'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: []
  };
}

function createTaskDetailModel() {
  return {
    project: {
      name: 'Task Detail Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M005',
      slice: 'S07',
      task: 'T02',
      phase: 'applying',
      task_name: 'Build task detail view',
      next_action: 'Inspect the selected task.'
    },
    automation: {
      status: 'active',
      scope: 'task',
      unit: 'S07/T02'
    },
    progress: {
      acceptance_criteria: {
        total: 3,
        passed: 1,
        partial: 0,
        failed: 0,
        pending: 2
      },
      slices: [
        {
          id: 'S07',
          name: 'Task inspection',
          current: true,
          status: 'running',
          artifacts: {
            roadmap: '.gsd/M005-ROADMAP.md',
            plan: '.gsd/S07-PLAN.md',
            unify: null
          },
          acceptance_criteria: {
            total: 3,
            passed: 1,
            partial: 0,
            failed: 0,
            pending: 2
          },
          tasks: {
            total: 3,
            completed: 1,
            pending: 2,
            risk: {
              low: 1,
              medium: 1,
              high: 1,
              unknown: 0
            },
            items: [
              {
                id: 'T01',
                task_id: 'S07-T01',
                name: 'Completed selected task',
                status: 'complete',
                risk: {
                  level: 'low',
                  reason: 'Already summarized.'
                },
                files: [
                  'src/completed.js'
                ],
                boundaries: [
                  'Keep completed task read-only.'
                ],
                acceptance_criteria: {
                  total: 1,
                  items: [
                    {
                      id: 'AC-1',
                      text: 'Given a completed summary exists\nWhen a task is selected\nThen summary status is visible',
                      status: 'passed',
                      evidence: 'summary confirmed the task',
                      source: '.gsd/S07-T01-SUMMARY.md',
                      source_type: 'summary'
                    }
                  ]
                },
                verify: [
                  'node test/dashboard-ui-smoke.test.js (AC-1)'
                ],
                done: 'The summary is available.',
                artifacts: {
                  plan: '.gsd/S07-T01-PLAN.xml',
                  summary: '.gsd/S07-T01-SUMMARY.md'
                }
              },
              {
                id: 'T02',
                task_id: 'S07-T02',
                name: 'Build task detail view',
                status: 'pending',
                risk: {
                  level: 'high',
                  reason: 'Selection state must stay local to the dashboard.'
                },
                files: [
                  'dashboard/app.js',
                  'dashboard/styles.css'
                ],
                boundaries: [
                  'Do not implement the evidence panel.'
                ],
                acceptance_criteria: {
                  total: 2,
                  items: [
                    {
                      id: 'AC-2',
                      text: 'Given the current task is selected\nWhen details render\nThen files and boundaries are shown',
                      status: 'pending'
                    },
                    {
                      id: 'AC-3',
                      text: 'Given source artifacts exist\nWhen details render\nThen plan links are visible',
                      status: 'pending'
                    }
                  ]
                },
                verify: [
                  'node test/dashboard-ui-smoke.test.js (AC-2, AC-3)'
                ],
                done: null,
                artifacts: {
                  plan: '.gsd/S07-T02-PLAN.xml',
                  summary: null
                }
              },
              {
                id: 'T03',
                task_id: 'S07-T03',
                name: null,
                status: 'pending',
                risk: {
                  level: 'medium'
                },
                acceptance_criteria: {
                  total: 0
                },
                artifacts: {
                  plan: null,
                  summary: null
                }
              }
            ]
          }
        }
      ]
    },
    current_task: {
      id: 'S07-T02',
      name: 'Build task detail view',
      risk: {
        level: 'high',
        reason: 'Selection state must stay local to the dashboard.'
      },
      files: [
        'dashboard/app.js',
        'dashboard/styles.css'
      ],
      boundaries: [
        'Do not implement the evidence panel.'
      ],
      acceptance_criteria: [
        {
          id: 'AC-2',
          text: 'Given the current task is selected\nWhen details render\nThen files and boundaries are shown',
          status: 'pending',
          evidence: '',
          source: null,
          source_type: null
        },
        {
          id: 'AC-3',
          text: 'Given source artifacts exist\nWhen details render\nThen plan links are visible',
          status: 'pending',
          evidence: '',
          source: null,
          source_type: null
        }
      ],
      action: [],
      verify: [
        'node test/dashboard-ui-smoke.test.js (AC-2, AC-3)'
      ],
      done: null,
      warnings: []
    },
    attention: [],
    activity: []
  };
}

function createEvidenceModel() {
  return {
    project: {
      name: 'Evidence Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M006',
      slice: 'S08',
      task: 'T03',
      phase: 'unified',
      task_name: 'Build evidence panel',
      next_action: 'Review the reconciliation output.'
    },
    automation: {
      status: 'inactive',
      scope: 'slice',
      unit: 'S08'
    },
    progress: {
      acceptance_criteria: {
        total: 3,
        passed: 2,
        partial: 1,
        failed: 0,
        pending: 0
      },
      slices: []
    },
    current_task: {
      id: 'S08-T03',
      name: 'Build evidence panel',
      risk: {
        level: 'medium'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: [],
    evidence: {
      latest_unify: {
        slice: 'S08',
        status: 'partial',
        source: '.gsd/S08-UNIFY.md',
        updated_at: '2026-04-29T10:00:00.000Z',
        summary: {
          status: 'partial',
          outcome: 'Reconciled most dashboard evidence.',
          acceptance_criteria: '2/3 passed, 1 partial, 0 failed',
          boundary_violations: 'none',
          recommendation: 'Continue, but address deferred fixture coverage.'
        },
        plan_vs_actual: [
          {
            task: 'T01',
            planned: 'Render evidence shell',
            actual: 'Rendered parser and UI',
            status: 'expanded',
            notes: 'Added dashboard summary fields'
          }
        ],
        risks_introduced: [
          {
            risk: 'Parser misses unusual markdown',
            source: 'UNIFY parser',
            impact: 'Some rows may be hidden',
            mitigation: 'Leave raw artifact link visible'
          }
        ],
        high_risk_approvals: [
          {
            task: 'T02',
            risk: 'high',
            approval: 'approved',
            reason: 'Approval grant matched fingerprint'
          }
        ],
        no_high_risk_tasks: false,
        decisions: [
          'Keep UNIFY parsing dependency-free.'
        ],
        deferred: [
          'Add browser screenshot coverage -> later'
        ]
      },
      latest_recovery: null,
      approval_request: null,
      recent_decisions: [
        'Keep UNIFY parsing dependency-free.'
      ]
    }
  };
}

function createAutomationCostModel() {
  return {
    project: {
      name: 'Automation Cost Fixture',
      project_type: 'application'
    },
    current: {
      milestone: 'M007',
      slice: 'S09',
      task: 'T01',
      phase: 'applying',
      task_name: 'Build automation panel',
      next_action: 'Review stopped automation state.'
    },
    automation: {
      status: 'recovery-needed',
      state: 'stopped',
      scope: 'milestone',
      unit: 'S09/T01',
      pid: null,
      started_at: '2026-04-29T08:00:00.000Z',
      last_stopped_at: '2026-04-29T08:09:00.000Z',
      last_stop_reason: 'budget_reached'
    },
    progress: {
      acceptance_criteria: {
        total: 0,
        passed: 0,
        pending: 0
      },
      slices: []
    },
    current_task: {
      id: 'S09-T01',
      name: 'Build automation panel',
      risk: {
        level: 'medium'
      },
      acceptance_criteria: []
    },
    attention: [],
    activity: [],
    costs: {
      available: true,
      source: '.gsd/COSTS.jsonl',
      entries: 2,
      total_tokens: 1500,
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 250,
      cache_read_input_tokens: 900,
      by_phase: [
        {
          phase: 'apply',
          entries: 2,
          total_tokens: 1500
        }
      ],
      by_unit: [
        {
          unit: 'S09-T01',
          entries: 2,
          total_tokens: 1500
        }
      ],
      latest: {
        unit: 'S09-T01',
        phase: 'apply',
        model: 'claude-sonnet',
        timestamp: '2026-04-29T08:08:00.000Z',
        total_tokens: 700
      }
    }
  };
}

function flushPromises() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = {};
    FakeEventSource.instances.push(this);
  }

  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }

  emit(name, event = {}) {
    if (this.listeners[name]) {
      this.listeners[name](event);
    }
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

FakeEventSource.CLOSED = 2;
FakeEventSource.instances = [];

async function testClientReferencesDashboardEndpoints() {
  const source = fs.readFileSync(appPath, 'utf8');

  assert.match(source, /\/api\/state/);
  assert.match(source, /\/api\/events/);
  assert.match(source, /dashboard-topbar/);
  assert.match(source, /dashboard-status-strip/);
  assert.match(source, /dashboard-status-badge/);
  assert.match(source, /dashboard-attention-panel/);
  assert.match(source, /dashboard-current-run-panel/);
  assert.match(source, /dashboard-why-task-panel/);
  assert.match(source, /dashboard-activity-feed/);
  assert.match(source, /dashboard-activity-summary/);
  assert.match(source, /dashboard-activity-pill/);
  assert.match(source, /dashboard-slice-roadmap/);
  assert.match(source, /dashboard-slice-detail/);
  assert.match(source, /data-dashboard-slice-id/);
  assert.match(source, /dashboard-task-detail/);
  assert.match(source, /data-dashboard-task-id/);
  assert.match(source, /dashboard-evidence-panel/);
  assert.match(source, /Plan vs actual/);
  assert.match(source, /Risks introduced/);
  assert.match(source, /High-risk approval/);
  assert.match(source, /Decisions made/);
  assert.match(source, /Deferred items/);
  assert.match(source, /dashboard-artifact-drawer/);
  assert.match(source, /data-dashboard-artifact-path/);
  assert.match(source, /Artifact viewer/);
  assert.match(source, /Loading artifact/);
  assert.match(source, /Artifact missing/);
  assert.match(source, /Artifact request rejected/);
  assert.match(source, /dashboard-automation-panel/);
  assert.match(source, /dashboard-cost-panel/);
  assert.match(source, /formatTokenCount/);
  assert.match(source, /Cost and token usage/);
  assert.match(source, /By phase/);
  assert.match(source, /Summary status/);
  assert.match(source, /Source artifacts/);
  assert.match(source, /Risk distribution/);
  assert.match(source, /formatActivityTimestamp/);
  assert.match(source, /Action summary/);
  assert.match(source, /Acceptance criteria covered/);
  assert.match(source, /Verify command/);
  assert.match(source, /formatRuntimeSince/);
  assert.match(source, /Dispatch phase/);
  assert.match(source, /Latest event/);
  assert.match(source, /Latest pointer/);
  assert.match(source, /Activity event groups/);
  assert.match(source, /\/api\/artifact\?path=/);
  assert.match(source, /dashboard-sidebar/);
  assert.match(source, /dashboard-main/);
  assert.match(source, /dashboard-context/);
  assert.match(source, /\bfetch\(/);
  assert.match(source, /\bEventSource\b/);
  assert.match(source, /connected/);
  assert.match(source, /reconnecting/);
  assert.match(source, /disconnected/);
  assert.match(source, /setInterval\(fetchState,\s*POLL_INTERVAL_MS\)/);
}

async function testSseStateEventUpdatesRenderedState() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };
  const fetchCalls = [];

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch(url) {
      fetchCalls.push(url);
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createModel('plan'));
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.deepStrictEqual(fetchCalls, ['/api/state']);
  assert.strictEqual(FakeEventSource.instances.length, 1);
  assert.strictEqual(FakeEventSource.instances[0].url, '/api/events');
  assert.match(root.innerHTML, /dashboard-topbar/);
  assert.match(root.innerHTML, /dashboard-status-strip/);
  assert.match(root.innerHTML, /Fixture Project/);
  assert.match(root.innerHTML, /M001/);
  assert.match(root.innerHTML, /S01/);
  assert.match(root.innerHTML, /T01/);
  assert.match(root.innerHTML, /Auto/);
  assert.match(root.innerHTML, /inactive/);
  assert.match(root.innerHTML, /dashboard-sidebar/);
  assert.match(root.innerHTML, /dashboard-main/);
  assert.match(root.innerHTML, /dashboard-context/);
  assert.match(root.innerHTML, /plan/);
  assert.match(root.innerHTML, /Task started/);

  FakeEventSource.instances[0].emit('state', {
    data: JSON.stringify(createModel('applying'))
  });

  assert.match(root.innerHTML, /applying/);
  assert.doesNotMatch(root.innerHTML, /Handle plan/);
  assert.match(root.innerHTML, /Connected/);
  assert.match(root.innerHTML, /Updated/);
}

async function testEmptyModelRendersEmptyShellStates() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createEmptyModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /No progress data yet/);
  assert.match(root.innerHTML, /No current task plan loaded/);
  assert.match(root.innerHTML, /No live activity yet/);
  assert.match(root.innerHTML, /No log pointer yet/);
  assert.match(root.innerHTML, /No recent activity yet/);
  assert.match(root.innerHTML, /No attention items/);
  assert.match(root.innerHTML, /No token data yet/);
}

async function testCurrentRunPanelRendersActiveOperationDetails() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createCurrentRunModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /dashboard-current-run-panel/);
  assert.match(root.innerHTML, /Current task/);
  assert.match(root.innerHTML, /Implement dashboard current run/);
  assert.match(root.innerHTML, /S03\/T04/);
  assert.match(root.innerHTML, /Current phase/);
  assert.match(root.innerHTML, /applying/);
  assert.match(root.innerHTML, /Dispatch phase/);
  assert.match(root.innerHTML, /apply/);
  assert.match(root.innerHTML, /PID/);
  assert.match(root.innerHTML, /4242/);
  assert.match(root.innerHTML, /Runtime/);
  assert.match(root.innerHTML, /Latest event/);
  assert.match(root.innerHTML, /Apply dispatch failed/);
  assert.match(root.innerHTML, /dispatch - dispatch_failed/);
  assert.match(root.innerHTML, /Latest pointer/);
  assert.match(root.innerHTML, /Log/);
  assert.match(root.innerHTML, /auto\.log/);
  assert.match(root.innerHTML, /Recovery/);
  assert.match(root.innerHTML, /AUTO-RECOVERY\.md/);
}

async function testWhyThisTaskPanelRendersTaskPlanEvidence() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createWhyTaskModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /dashboard-why-task-panel/);
  assert.match(root.innerHTML, /Why this task/);
  assert.match(root.innerHTML, /Explain task rationale/);
  assert.match(root.innerHTML, /Task plan/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FS04-T05-PLAN\.xml/);
  assert.match(root.innerHTML, /Action summary/);
  assert.match(root.innerHTML, /1\. Render the task action summary/);
  assert.match(root.innerHTML, /Risk level/);
  assert.match(root.innerHTML, /high/);
  assert.match(root.innerHTML, /Task plan fields must not be mixed with inferred reasoning/);
  assert.match(root.innerHTML, /Acceptance criteria covered/);
  assert.match(root.innerHTML, /AC-4/);
  assert.match(root.innerHTML, /action evidence is visible/);
  assert.match(root.innerHTML, /AC-5/);
  assert.match(root.innerHTML, /commands are shown verbatim/);
  assert.match(root.innerHTML, /Verify command/);
  assert.match(root.innerHTML, /node test\/dashboard-ui-smoke\.test\.js \(AC-4, AC-5\)/);
  assert.doesNotMatch(root.innerHTML, /doing this because/i);
}

async function testAttentionPanelRendersRequiredActionDetails() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createAttentionModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /dashboard-attention-panel/);
  assert.match(root.innerHTML, /Approval required/);
  assert.match(root.innerHTML, /risk high meets approval_required_risk high/);
  assert.match(root.innerHTML, /Touches deployment configuration/);
  assert.match(root.innerHTML, /APPROVAL-REQUEST\.json/);
  assert.match(root.innerHTML, /S01-T02-PLAN\.xml/);
  assert.match(root.innerHTML, /Auto-mode stopped early/);
  assert.match(root.innerHTML, /dispatch_failed/);
  assert.match(root.innerHTML, /AUTO-RECOVERY\.md/);
  assert.match(root.innerHTML, /src\/fixture\.txt/);
  assert.match(root.innerHTML, /Auto-mode lock is stale/);
  assert.match(root.innerHTML, /99999999/);
  assert.match(root.innerHTML, /auto\.lock/);
  assert.match(root.innerHTML, /Phase blocked/);
  assert.match(root.innerHTML, /STATE\.md/);
  assert.match(root.innerHTML, /UNIFY required/);
  assert.match(root.innerHTML, /Expected report/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FAPPROVAL-REQUEST\.json/);

  assert.ok(
    root.innerHTML.indexOf('Approval required') < root.innerHTML.indexOf('UNIFY required'),
    'critical approval item should render before warning UNIFY item'
  );
  assert.ok(
    root.innerHTML.indexOf('dashboard-attention-panel') < root.innerHTML.indexOf('id="progress"'),
    'attention panel should render above normal progress'
  );
}

async function testActivityFeedRendersExecutionHistory() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createActivityFeedModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /dashboard-activity-feed/);
  assert.match(root.innerHTML, /dashboard-activity-summary/);
  assert.match(root.innerHTML, /Activity event groups/);
  assert.match(root.innerHTML, /Lifecycle/);
  assert.match(root.innerHTML, /Task/);
  assert.match(root.innerHTML, /Approval/);
  assert.match(root.innerHTML, /Recovery/);
  assert.match(root.innerHTML, /Error/);
  assert.match(root.innerHTML, /dashboard-activity--category-lifecycle/);
  assert.match(root.innerHTML, /dashboard-activity--category-task/);
  assert.match(root.innerHTML, /dashboard-activity--category-approval/);
  assert.match(root.innerHTML, /dashboard-activity--category-recovery/);
  assert.match(root.innerHTML, /dashboard-activity--category-error/);
  assert.match(root.innerHTML, /datetime="2026-04-29T08:06:00\.000Z"/);
  assert.match(root.innerHTML, /State validation failed/);
  assert.match(root.innerHTML, /state_validation_failed/);
  assert.match(root.innerHTML, /phase missing/);
  assert.match(root.innerHTML, /risk_level/);
  assert.match(root.innerHTML, /high/);
  assert.match(root.innerHTML, /Recovery report written/);
  assert.match(root.innerHTML, /exit_code/);
  assert.match(root.innerHTML, /42/);
  assert.match(root.innerHTML, /Apply dispatch started/);
  assert.match(root.innerHTML, /apply/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FAPPROVAL-REQUEST\.json/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FAUTO-RECOVERY\.md/);
}

async function testSliceRoadmapRendersSelectableProgress() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: '',
    clickListener: null,
    addEventListener(name, listener) {
      assert.strictEqual(name, 'click');
      this.clickListener = listener;
    },
    contains() {
      return true;
    }
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createSliceRoadmapModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /dashboard-slice-roadmap/);
  assert.match(root.innerHTML, /Slice statuses/);
  assert.match(root.innerHTML, /Pending discovery/);
  assert.match(root.innerHTML, /Planned foundation/);
  assert.match(root.innerHTML, /Running dashboard roadmap/);
  assert.match(root.innerHTML, /Final reconciliation/);
  assert.match(root.innerHTML, /dashboard-slice-roadmap-item--current/);
  assert.match(root.innerHTML, /Current slice/);
  assert.match(root.innerHTML, /dashboard-slice-roadmap-item--selected/);
  assert.match(root.innerHTML, /Risk distribution/);
  assert.match(root.innerHTML, /high/);
  assert.match(root.innerHTML, /medium/);
  assert.match(root.innerHTML, /low/);
  assert.match(root.innerHTML, /Acceptance criteria/);
  assert.match(root.innerHTML, /Render roadmap cards/);
  assert.match(root.innerHTML, /Build selectable detail/);
  assert.doesNotMatch(root.innerHTML, /Ship summary/);

  const selectedNode = {
    getAttribute(name) {
      assert.strictEqual(name, 'data-dashboard-slice-id');
      return 'S04';
    }
  };

  root.clickListener({
    target: {
      closest(selector) {
        assert.strictEqual(selector, '[data-dashboard-slice-id]');
        return selectedNode;
      }
    }
  });

  assert.match(root.innerHTML, /Ship summary/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FS04-UNIFY\.md/);
  assert.match(root.innerHTML, /dashboard-slice-status--unified/);
}

async function testTaskDetailRendersSelectedTaskPlanData() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: '',
    clickListener: null,
    addEventListener(name, listener) {
      assert.strictEqual(name, 'click');
      this.clickListener = listener;
    },
    contains() {
      return true;
    }
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createTaskDetailModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /dashboard-task-detail/);
  assert.match(root.innerHTML, /Task detail/);
  assert.match(root.innerHTML, /Current task/);
  assert.match(root.innerHTML, /Build task detail view/);
  assert.match(root.innerHTML, /Summary status/);
  assert.match(root.innerHTML, /applying/);
  assert.match(root.innerHTML, /Risk/);
  assert.match(root.innerHTML, /high/);
  assert.match(root.innerHTML, /Selection state must stay local/);
  assert.match(root.innerHTML, /Files/);
  assert.match(root.innerHTML, /dashboard\/app\.js/);
  assert.match(root.innerHTML, /dashboard\/styles\.css/);
  assert.match(root.innerHTML, /Boundaries/);
  assert.match(root.innerHTML, /Do not implement the evidence panel/);
  assert.match(root.innerHTML, /Acceptance criteria/);
  assert.match(root.innerHTML, /AC-2/);
  assert.match(root.innerHTML, /files and boundaries are shown/);
  assert.match(root.innerHTML, /Verify/);
  assert.match(root.innerHTML, /node test\/dashboard-ui-smoke\.test\.js \(AC-2, AC-3\)/);
  assert.match(root.innerHTML, /Source artifacts/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FS07-T02-PLAN\.xml/);
  assert.match(root.innerHTML, /dashboard-slice-task--current/);
  assert.match(root.innerHTML, /dashboard-slice-task--selected/);

  const selectedNode = {
    getAttribute(name) {
      assert.strictEqual(name, 'data-dashboard-task-id');
      return 'S07-T01';
    }
  };

  root.clickListener({
    target: {
      closest(selector) {
        if (selector === '[data-dashboard-slice-id]') {
          return null;
        }

        assert.strictEqual(selector, '[data-dashboard-task-id]');
        return selectedNode;
      }
    }
  });

  assert.match(root.innerHTML, /Completed task/);
  assert.match(root.innerHTML, /Completed selected task/);
  assert.match(root.innerHTML, /complete/);
  assert.match(root.innerHTML, /summary confirmed the task/);
  assert.match(root.innerHTML, /The summary is available/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FS07-T01-SUMMARY\.md/);
  assert.doesNotMatch(root.innerHTML, /Current task<\/strong>/);
}

async function testEvidencePanelRendersReconciliationOutput() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createEvidenceModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /dashboard-evidence-panel/);
  assert.match(root.innerHTML, /Evidence/);
  assert.match(root.innerHTML, /UNIFY status/);
  assert.match(root.innerHTML, /partial/);
  assert.match(root.innerHTML, /AC result/);
  assert.match(root.innerHTML, /2\/3 passed, 1 partial, 0 failed/);
  assert.match(root.innerHTML, /Plan vs actual/);
  assert.match(root.innerHTML, /Render evidence shell/);
  assert.match(root.innerHTML, /Rendered parser and UI/);
  assert.match(root.innerHTML, /expanded/);
  assert.match(root.innerHTML, /Risks introduced/);
  assert.match(root.innerHTML, /Parser misses unusual markdown/);
  assert.match(root.innerHTML, /Leave raw artifact link visible/);
  assert.match(root.innerHTML, /High-risk approval/);
  assert.match(root.innerHTML, /approved/);
  assert.match(root.innerHTML, /Approval grant matched fingerprint/);
  assert.match(root.innerHTML, /Decisions made/);
  assert.match(root.innerHTML, /Keep UNIFY parsing dependency-free/);
  assert.match(root.innerHTML, /Deferred items/);
  assert.match(root.innerHTML, /Add browser screenshot coverage/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FS08-UNIFY\.md/);
}

async function testAutomationAndCostPanelRendersDiagnostics() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: ''
  };

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch() {
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve(createAutomationCostModel());
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  assert.match(root.innerHTML, /dashboard-automation-panel/);
  assert.match(root.innerHTML, /Automation/);
  assert.match(root.innerHTML, /State/);
  assert.match(root.innerHTML, /stopped/);
  assert.match(root.innerHTML, /recovery-needed/);
  assert.match(root.innerHTML, /milestone/);
  assert.match(root.innerHTML, /S09\/T01/);
  assert.match(root.innerHTML, /Last stop/);
  assert.match(root.innerHTML, /Stop reason/);
  assert.match(root.innerHTML, /budget_reached/);
  assert.match(root.innerHTML, /dashboard-cost-panel/);
  assert.match(root.innerHTML, /Costs/);
  assert.match(root.innerHTML, /total tokens/);
  assert.match(root.innerHTML, /1\.5k/);
  assert.match(root.innerHTML, /input tokens/);
  assert.match(root.innerHTML, /output tokens/);
  assert.match(root.innerHTML, /cache write/);
  assert.match(root.innerHTML, /cache read/);
  assert.match(root.innerHTML, /By phase/);
  assert.match(root.innerHTML, /apply/);
  assert.match(root.innerHTML, /By unit/);
  assert.match(root.innerHTML, /S09-T01/);
  assert.match(root.innerHTML, /claude-sonnet/);
  assert.match(root.innerHTML, /\/api\/artifact\?path=\.gsd%2FCOSTS\.jsonl/);
}

function dispatchArtifactClick(root, artifactPath, label) {
  let prevented = false;
  const artifactNode = {
    getAttribute(name) {
      if (name === 'data-dashboard-artifact-path') {
        return artifactPath;
      }

      if (name === 'data-dashboard-artifact-label') {
        return label;
      }

      return null;
    }
  };

  root.clickListener({
    preventDefault() {
      prevented = true;
    },
    target: {
      closest(selector) {
        if (selector === '[data-dashboard-slice-id]') {
          return null;
        }

        if (selector === '[data-dashboard-task-id]') {
          return null;
        }

        if (selector === '[data-dashboard-artifact-path]') {
          return artifactNode;
        }

        if (selector === '[data-dashboard-artifact-close]') {
          return null;
        }

        return null;
      }
    }
  });

  assert.strictEqual(prevented, true);
}

function dispatchArtifactClose(root) {
  const closeNode = {};

  root.clickListener({
    target: {
      closest(selector) {
        if (selector === '[data-dashboard-slice-id]') {
          return null;
        }

        if (selector === '[data-dashboard-task-id]') {
          return null;
        }

        if (selector === '[data-dashboard-artifact-path]') {
          return null;
        }

        if (selector === '[data-dashboard-artifact-close]') {
          return closeNode;
        }

        return null;
      }
    }
  });
}

async function testArtifactViewerFetchesAndRendersStates() {
  const source = fs.readFileSync(appPath, 'utf8');
  const root = {
    innerHTML: '',
    clickListener: null,
    addEventListener(name, listener) {
      assert.strictEqual(name, 'click');
      this.clickListener = listener;
    },
    contains() {
      return true;
    }
  };
  const fetchCalls = [];

  FakeEventSource.instances = [];

  const sandbox = {
    clearInterval() {},
    document: {
      querySelector(selector) {
        assert.strictEqual(selector, '[data-dashboard-root]');
        return root;
      }
    },
    EventSource: FakeEventSource,
    fetch(url) {
      fetchCalls.push(url);

      if (url === '/api/state') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json() {
            return Promise.resolve(createTaskDetailModel());
          }
        });
      }

      if (String(url).includes('MISSING')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json() {
            return Promise.resolve({
              ok: false,
              error: {
                code: 'artifact_not_found',
                message: 'Artifact not found.'
              }
            });
          }
        });
      }

      if (String(url).includes('SECRET')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json() {
            return Promise.resolve({
              ok: false,
              error: {
                code: 'invalid_artifact_path',
                message: 'Artifact path must stay inside .gsd/.'
              }
            });
          }
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json() {
          return Promise.resolve({
            ok: true,
            artifact: {
              path: '.gsd/S07-T02-PLAN.xml',
              name: 'S07-T02-PLAN.xml',
              size: 26,
              modifiedAt: '2026-04-29T10:30:00.000Z',
              content: '<task-plan>content</task-plan>'
            }
          });
        }
      });
    },
    setInterval() {
      return 1;
    },
    window: {
      addEventListener() {}
    }
  };

  vm.runInNewContext(source, sandbox);
  await flushPromises();

  dispatchArtifactClick(root, '.gsd/S07-T02-PLAN.xml', 'Task plan');

  assert.match(root.innerHTML, /dashboard-artifact-drawer/);
  assert.match(root.innerHTML, /Artifact viewer/);
  assert.match(root.innerHTML, /Loading artifact/);
  assert.match(root.innerHTML, /Task plan/);

  await flushPromises();

  assert.match(root.innerHTML, /S07-T02-PLAN\.xml/);
  assert.match(root.innerHTML, /26 B/);
  assert.match(root.innerHTML, /&lt;task-plan&gt;content&lt;\/task-plan&gt;/);
  assert.ok(fetchCalls.some((url) => (
    /\/api\/artifact\?path=\.gsd%2FS07-T02-PLAN\.xml/.test(url)
  )));

  dispatchArtifactClick(root, '.gsd/MISSING.md', 'Missing report');
  await flushPromises();

  assert.match(root.innerHTML, /Artifact missing/);
  assert.match(root.innerHTML, /Artifact not found/);
  assert.match(root.innerHTML, /\.gsd\/MISSING\.md/);

  dispatchArtifactClick(root, '.gsd/../SECRET.md', 'Rejected report');
  await flushPromises();

  assert.match(root.innerHTML, /Artifact request rejected/);
  assert.match(root.innerHTML, /Artifact path must stay inside \.gsd\//);

  dispatchArtifactClose(root);

  assert.doesNotMatch(root.innerHTML, /dashboard-artifact-drawer/);
}

async function testStylesExposeConnectionStates() {
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.match(styles, /\.dashboard-connection--connected/);
  assert.match(styles, /\.dashboard-connection--reconnecting/);
  assert.match(styles, /\.dashboard-connection--disconnected/);
  assert.match(styles, /\.dashboard-status-strip/);
  assert.match(styles, /\.dashboard-status-badge/);
  assert.match(styles, /\.dashboard-status-badge--active/);
  assert.match(styles, /\.dashboard-status-badge--approval-required/);
  assert.match(styles, /\.dashboard-attention-panel/);
  assert.match(styles, /\.dashboard-attention-item--critical/);
  assert.match(styles, /\.dashboard-current-run-panel/);
  assert.match(styles, /\.dashboard-current-run-details/);
  assert.match(styles, /\.dashboard-current-run-activity--warning/);
  assert.match(styles, /\.dashboard-current-run-pointer-links/);
  assert.match(styles, /\.dashboard-automation-panel/);
  assert.match(styles, /\.dashboard-automation-summary/);
  assert.match(styles, /\.dashboard-status-badge--stopped/);
  assert.match(styles, /\.dashboard-cost-panel/);
  assert.match(styles, /\.dashboard-cost-summary/);
  assert.match(styles, /\.dashboard-cost-breakdown/);
  assert.match(styles, /\.dashboard-cost-latest/);
  assert.match(styles, /\.dashboard-why-task-panel/);
  assert.match(styles, /\.dashboard-why-task-grid/);
  assert.match(styles, /\.dashboard-why-task-risk-badge--high/);
  assert.match(styles, /\.dashboard-why-task-criterion--passed/);
  assert.match(styles, /\.dashboard-activity-feed/);
  assert.match(styles, /\.dashboard-activity-summary/);
  assert.match(styles, /\.dashboard-activity-count--approval/);
  assert.match(styles, /\.dashboard-activity-pill--recovery/);
  assert.match(styles, /\.dashboard-activity-details/);
  assert.match(styles, /\.dashboard-slice-roadmap/);
  assert.match(styles, /\.dashboard-slice-roadmap-item--current/);
  assert.match(styles, /\.dashboard-slice-roadmap-item--selected/);
  assert.match(styles, /\.dashboard-slice-detail/);
  assert.match(styles, /\.dashboard-slice-status--running/);
  assert.match(styles, /\.dashboard-slice-risk--high/);
  assert.match(styles, /\.dashboard-slice-task-list/);
  assert.match(styles, /\.dashboard-task-detail/);
  assert.match(styles, /\.dashboard-task-detail--current/);
  assert.match(styles, /\.dashboard-task-detail--completed/);
  assert.match(styles, /\.dashboard-task-detail-grid/);
  assert.match(styles, /\.dashboard-task-detail-criterion--passed/);
  assert.match(styles, /\.dashboard-evidence-panel/);
  assert.match(styles, /\.dashboard-evidence-summary/);
  assert.match(styles, /\.dashboard-evidence-grid/);
  assert.match(styles, /\.dashboard-evidence-badge--partial/);
  assert.match(styles, /\.dashboard-evidence-fields/);
  assert.match(styles, /\.dashboard-activity-pill--expanded/);
  assert.match(styles, /\.dashboard-artifact-drawer/);
  assert.match(styles, /\.dashboard-artifact-backdrop/);
  assert.match(styles, /\.dashboard-artifact-content/);
  assert.match(styles, /\.dashboard-artifact-state--rejected/);
  assert.match(styles, /max-height:\s*min\(680px,\s*72vh\)/);
  assert.match(styles, /overflow-y:\s*auto/);
  assert.match(styles, /\.dashboard-artifact-link/);
  assert.match(styles, /\.dashboard-workspace/);
  assert.match(styles, /grid-template-columns:\s*minmax\(180px,\s*220px\)\s*minmax\(0,\s*1fr\)\s*minmax\(260px,\s*320px\)/);
  assert.match(styles, /\.dashboard-sidebar/);
  assert.match(styles, /\.dashboard-main/);
  assert.match(styles, /\.dashboard-context/);
  assert.match(styles, /@media \(max-width: 1180px\)/);
}

async function run() {
  await testClientReferencesDashboardEndpoints();
  await testSseStateEventUpdatesRenderedState();
  await testEmptyModelRendersEmptyShellStates();
  await testCurrentRunPanelRendersActiveOperationDetails();
  await testWhyThisTaskPanelRendersTaskPlanEvidence();
  await testAttentionPanelRendersRequiredActionDetails();
  await testActivityFeedRendersExecutionHistory();
  await testSliceRoadmapRendersSelectableProgress();
  await testTaskDetailRendersSelectedTaskPlanData();
  await testEvidencePanelRendersReconciliationOutput();
  await testAutomationAndCostPanelRendersDiagnostics();
  await testArtifactViewerFetchesAndRendersStates();
  await testStylesExposeConnectionStates();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
