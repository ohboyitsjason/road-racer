import { getCurrentTheme, onThemeChange } from '../theme/themeManager.js';
import { createBedroom, removeBedroom } from './bedroom.js';

function updateEnvironment() {
    const theme = getCurrentTheme();
    if (theme.bedroom && theme.bedroom.enabled) {
        createBedroom();
    } else {
        removeBedroom();
    }
}

export function initEnvironment() {
    updateEnvironment();
    onThemeChange(() => updateEnvironment());
}
