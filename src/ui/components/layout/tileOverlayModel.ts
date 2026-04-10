export function getTileOverlayVisibility(params: {
    isHovered: boolean;
    isScrollSettled: boolean;
    isImageVisible: boolean;
    showGroupIds: boolean;
    isGroupRepresentative: boolean;
}) {
    const showVisibleOverlays = params.isScrollSettled && params.isImageVisible;
    const showSettledOverlays = params.isHovered && showVisibleOverlays;

    return {
        showCaption: showSettledOverlays,
        showDeclusterButton: showSettledOverlays,
        showStackBadge: showVisibleOverlays,
        showGroupModeBadge: params.isGroupRepresentative && showVisibleOverlays,
        showGroupIdPills: params.showGroupIds && showVisibleOverlays,
    };
}
