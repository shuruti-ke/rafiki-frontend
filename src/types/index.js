/**
 * Type definitions (JSDoc) for HR Portal entities.
 * These serve as documentation — the app is plain JS, not TypeScript.
 */

/**
 * @typedef {Object} KBDocument
 * @property {number} id
 * @property {number} org_id
 * @property {string} title
 * @property {string} [description]
 * @property {string} file_path
 * @property {string} original_filename
 * @property {string} mime_type
 * @property {number} file_size
 * @property {string} category
 * @property {string[]} tags
 * @property {number} version
 * @property {number} [parent_id]
 * @property {boolean} is_current
 * @property {boolean} is_indexed
 * @property {number} uploaded_by
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} Announcement
 * @property {number} id
 * @property {number} org_id
 * @property {string} title
 * @property {string} content
 * @property {boolean} is_training
 * @property {string[]} target_departments
 * @property {string[]} target_roles
 * @property {string} priority
 * @property {string} [published_at]
 * @property {string} [expires_at]
 * @property {number} created_by
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} ReadReceipt
 * @property {number} id
 * @property {number} announcement_id
 * @property {number} user_id
 * @property {string} read_at
 */

/**
 * @typedef {Object} TrainingAssignment
 * @property {number} id
 * @property {number} announcement_id
 * @property {number} user_id
 * @property {number} assigned_by
 * @property {string} [due_date]
 * @property {string} [completed_at]
 * @property {string} created_at
 */

/**
 * @typedef {Object} EmployeeDoc
 * @property {number} id
 * @property {number} user_id
 * @property {number} org_id
 * @property {string} doc_type
 * @property {string} title
 * @property {string} file_path
 * @property {string} original_filename
 * @property {string} mime_type
 * @property {number} file_size
 * @property {number} uploaded_by
 * @property {string} created_at
 */

/**
 * @typedef {Object} PerformanceEvaluation
 * @property {number} id
 * @property {number} user_id
 * @property {number} org_id
 * @property {string} evaluation_period
 * @property {number} evaluator_id
 * @property {number} overall_rating
 * @property {string} [strengths]
 * @property {string} [areas_for_improvement]
 * @property {string} [goals_for_next_period]
 * @property {string} [comments]
 * @property {number[]} objective_ids
 * @property {string} created_at
 */

/**
 * @typedef {Object} DisciplinaryRecord
 * @property {number} id
 * @property {number} user_id
 * @property {number} org_id
 * @property {string} record_type
 * @property {string} description
 * @property {string} date_of_incident
 * @property {number} recorded_by
 * @property {string[]} witnesses
 * @property {string} [outcome]
 * @property {string[]} attachments
 * @property {string} created_at
 */

/**
 * @typedef {Object} GuidedModule
 * @property {number} id
 * @property {number|null} org_id
 * @property {string} name
 * @property {string} category
 * @property {string} [description]
 * @property {number} duration_minutes
 * @property {string} [icon]
 * @property {boolean} is_active
 * @property {number} created_by
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} GuidedModuleDetail
 * @property {number} id
 * @property {number|null} org_id
 * @property {string} name
 * @property {string} category
 * @property {string} [description]
 * @property {number} duration_minutes
 * @property {string} [icon]
 * @property {boolean} is_active
 * @property {number} created_by
 * @property {string} created_at
 * @property {string} updated_at
 * @property {Object[]} [steps]
 * @property {string[]} [triggers]
 * @property {string[]} [safety_checks]
 */

/**
 * @typedef {Object} ModuleStep
 * @property {number} step_index
 * @property {number} total_steps
 * @property {string} type
 * @property {string} message
 * @property {string|null} [expected_input]
 * @property {boolean} safety_check
 * @property {string|null} [media_url]
 */

/**
 * @typedef {Object} ModuleStepDefinition
 * @property {string} type - intro, prompt, input, reflection, rating, summary, video, audio
 * @property {string} message
 * @property {string|null} expected_input - none, free_text, rating_0_10
 * @property {boolean} safety_check
 * @property {string|null} [media_url]
 */

/**
 * @typedef {Object} GuidedPathSession
 * @property {number} session_id
 * @property {string} module_name
 * @property {ModuleStep} step
 * @property {string} status
 */

/**
 * @typedef {Object} OrgProfile
 * @property {number} id
 * @property {number} org_id
 * @property {string|null} org_purpose
 * @property {string|null} industry
 * @property {string|null} work_environment
 * @property {string[]} benefits_tags
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} RoleProfile
 * @property {number} id
 * @property {number} org_id
 * @property {string} role_key
 * @property {string|null} role_family
 * @property {string|null} seniority_band
 * @property {string|null} work_pattern
 * @property {string[]} stressor_profile
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} ContextPack
 * @property {{ purpose: string|null, industry: string|null, work_environment: string|null, benefits_tags: string[] }} org
 * @property {{ family: string|null, seniority_band: string|null, work_pattern: string|null, stressor_profile: string[] }} role
 * @property {{ language: string, stress_band: string|null, theme_category: string|null, available_time: number|null }} session
 */

/**
 * @typedef {Object} ModuleSuggestion
 * @property {number} id
 * @property {string} name
 * @property {string} category
 * @property {string|null} description
 * @property {number} duration_minutes
 * @property {string|null} icon
 * @property {string|null} match_reason
 */

/**
 * @typedef {Object} StartSessionRequest
 * @property {string|null} [role_key]
 * @property {string} [language]
 * @property {string|null} [stress_band]
 * @property {string|null} [theme_category]
 * @property {number|null} [available_time]
 * @property {number|null} [pre_rating]
 */

// ─── Manager & Leadership Toolkit Types ───

/**
 * @typedef {Object} ManagerConfig
 * @property {number} id
 * @property {number} user_id
 * @property {number} org_id
 * @property {number|null} org_member_id
 * @property {string} manager_level - L1/L2/L3/L4
 * @property {string[]} allowed_data_types
 * @property {string[]} allowed_features
 * @property {string[]} department_scope
 * @property {boolean} is_active
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} TeamMember
 * @property {number} user_id
 * @property {string} name
 * @property {string|null} job_title
 * @property {string|null} department
 * @property {string|null} email
 * @property {number} objectives_count
 * @property {number|null} last_evaluation_rating
 */

/**
 * @typedef {Object} CoachingSession
 * @property {number} id
 * @property {number} manager_id
 * @property {number} org_id
 * @property {number} employee_member_id
 * @property {string|null} employee_name
 * @property {string} concern
 * @property {string|null} ai_response
 * @property {Object|null} structured_response
 * @property {string|null} outcome_logged
 * @property {string} created_at
 */

/**
 * @typedef {Object} CoachingPlanResponse
 * @property {number} session_id
 * @property {string|null} employee_name
 * @property {string} situation_summary
 * @property {string} conversation_script
 * @property {string[]} action_options
 * @property {string} escalation_path
 */

/**
 * @typedef {Object} ToolkitModule
 * @property {number} id
 * @property {number|null} org_id
 * @property {string} category
 * @property {string} title
 * @property {Object} content
 * @property {number} version
 * @property {boolean} is_active
 * @property {string} language
 * @property {number|null} created_by
 * @property {string|null} approved_by
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} ManagerDashboardData
 * @property {number} team_size
 * @property {number} avg_objective_completion
 * @property {number} avg_performance_rating
 * @property {number} upcoming_deadlines
 * @property {number} coaching_sessions_count
 * @property {CoachingSession[]} recent_sessions
 */

export {};
