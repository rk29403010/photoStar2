import type React from 'react';
import { getNextNavButtonRightOffset } from './photoViewportImageState';

const INFO_PANEL_WIDTH = 360;

function getNavButtonOpacity(params: {
    controlsVisible: boolean;
    enabled: boolean;
}): number {
    const { controlsVisible, enabled } = params;
    if (!controlsVisible) {
        return 0;
    }

    return enabled ? 0.92 : 0.15;
}

function getNavButtonCursor(params: {
    enabled: boolean;
    isImageTransitionPending: boolean;
}): 'progress' | 'pointer' | 'default' {
    const { enabled, isImageTransitionPending } = params;
    if (isImageTransitionPending) {
        return 'progress';
    }

    return enabled ? 'pointer' : 'default';
}

function getNavButtonBackground(isImageTransitionPending: boolean): string {
    if (isImageTransitionPending) {
        return 'rgba(59,130,246,0.42)';
    }

    return 'rgba(0,0,0,0.5)';
}

const navButtonInnerStyle = (isImageTransitionPending: boolean): React.CSSProperties => ({
    background: getNavButtonBackground(isImageTransitionPending),
    borderRadius: '50%',
    width: 38,
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: 18,
});

function NavButton(props: {
    readonly label: string;
    readonly side: 'left' | 'right';
    readonly enabled: boolean;
    readonly controlsVisible: boolean;
    readonly isImageTransitionPending: boolean;
    readonly showInfoPanel: boolean;
    readonly onClick: () => void;
}) {
    const { label, side, enabled, controlsVisible, isImageTransitionPending, showInfoPanel, onClick } = props;
    const sidePosition = side === 'left'
        ? { left: '12px', zIndex: 1001, transition: 'opacity 0.35s ease' }
        : {
            right: `${getNextNavButtonRightOffset({ showInfoPanel, infoPanelWidth: INFO_PANEL_WIDTH })}px`,
            zIndex: 1003,
            transition: 'opacity 0.35s ease, right 0.22s ease',
        };

    return (
        <div
            style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: getNavButtonOpacity({ controlsVisible, enabled }),
                cursor: getNavButtonCursor({ enabled, isImageTransitionPending }),
                padding: '12px',
                pointerEvents: controlsVisible ? 'auto' : 'none',
                ...sidePosition,
            }}
            onClick={(event) => {
                event.stopPropagation();
                onClick();
            }}
        >
            <div style={navButtonInnerStyle(isImageTransitionPending)}>{label}</div>
        </div>
    );
}

export const NavButtons: React.FC<{
    readonly currentIndex: number;
    readonly assetsLength: number;
    readonly onPrevious: () => void;
    readonly onNext: () => void;
    readonly controlsVisible: boolean;
    readonly showInfoPanel: boolean;
    readonly isImageTransitionPending: boolean;
}> = ({ currentIndex, assetsLength, onPrevious, onNext, controlsVisible, showInfoPanel, isImageTransitionPending }) => (
    <>
        <NavButton label="◀" side="left" enabled={currentIndex > 0} controlsVisible={controlsVisible} isImageTransitionPending={isImageTransitionPending} showInfoPanel={showInfoPanel} onClick={onPrevious} />
        <NavButton label="▶" side="right" enabled={currentIndex < assetsLength - 1} controlsVisible={controlsVisible} isImageTransitionPending={isImageTransitionPending} showInfoPanel={showInfoPanel} onClick={onNext} />
    </>
);
