export function isTimelineGroupPageRequestId(id: string | undefined): boolean {
    return typeof id === 'string' && id.startsWith('get_timeline_group_page-');
}

export function isTimelineJumpTargetRequestId(id: string | undefined): boolean {
    return typeof id === 'string' && id.startsWith('get_timeline_jump_target-');
}
