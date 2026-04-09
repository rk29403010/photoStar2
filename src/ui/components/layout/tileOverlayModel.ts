export function getTileOverlayVisibility(params: {
    isHovered: boolean;
    isScrollSettled: boolean;
    showGroupIds: boolean;
    isGroupRepresentative: boolean;
}) {
    const showSettledOverlays = params.isHovered && params.isScrollSettled;

    return {
        showCaption: showSettledOverlays,
        showDeclusterButton: showSettledOverlays,
        showGroupModeBadge: params.isGroupRepresentative && params.isScrollSettled,
        showGroupIdPills: params.showGroupIds && params.isScrollSettled,
    };
}
