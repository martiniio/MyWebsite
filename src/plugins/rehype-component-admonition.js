import { h } from 'hastscript';

export function AdmonitionComponent(node, properties, variant) {
	const iconMap = {
		note: {
			icon: 'info',
			title: 'Note',
			bgColor: 'bg-blue-50',
			borderColor: 'border-blue-400',
			iconColor: 'text-blue-500',
			bgColorDark: 'bg-blue-900/20',
			borderColorDark: 'border-blue-500',
			iconColorDark: 'text-blue-400',
		},
		tip: {
			icon: 'lightbulb',
			title: 'Tip',
			bgColor: 'bg-green-50',
			borderColor: 'border-green-400',
			iconColor: 'text-green-500',
			bgColorDark: 'bg-green-900/20',
			borderColorDark: 'border-green-500',
			iconColorDark: 'text-green-400',
		},
		important: {
			icon: 'star',
			title: 'Important',
			bgColor: 'bg-purple-50',
			borderColor: 'border-purple-400',
			iconColor: 'text-purple-500',
			bgColorDark: 'bg-purple-900/20',
			borderColorDark: 'border-purple-500',
			iconColorDark: 'text-purple-400',
		},
		caution: {
			icon: 'alert-triangle',
			title: 'Caution',
			bgColor: 'bg-yellow-50',
			borderColor: 'border-yellow-400',
			iconColor: 'text-yellow-500',
			bgColorDark: 'bg-yellow-900/20',
			borderColorDark: 'border-yellow-500',
			iconColorDark: 'text-yellow-400',
		},
		warning: {
			icon: 'alert-circle',
			title: 'Warning',
			bgColor: 'bg-red-50',
			borderColor: 'border-red-400',
			iconColor: 'text-red-500',
			bgColorDark: 'bg-red-900/20',
			borderColorDark: 'border-red-500',
			iconColorDark: 'text-red-400',
		},
	};

	const config = iconMap[variant] || iconMap.note;

	const iconSvg = {
		info: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
		lightbulb: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10V6c0-3.314-2.686-6-6-6-2.867 0-5.29 1.993-5.878 4.512C9.29 1.993 6.867 0 4 0 1.314 0 0 2.686 0 6v6c0 5.523 4.477 10 10 10z"/><path d="M9 12l2 2 4-4"/></svg>`,
		star: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
		'alert-triangle': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 9.05-4.95 10.95"/><path d="M12 15V9"/><path d="M12 22.08V15"/></svg>`,
		'alert-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`,
	};

	return h(
		'div',
		{
			class: `admonition admonition-${variant} ${config.bgColor} dark:${config.bgColorDark} border-l-4 ${config.borderColor} dark:${config.borderColorDark} rounded-r-lg p-4 my-4`,
		},
		[
			h(
				'div',
				{ class: 'flex items-start gap-3' },
				[
					h('span', {
						class: `${config.iconColor} dark:${config.iconColorDark} flex-shrink-0 mt-0.5`,
						innerHTML: iconSvg[config.icon],
					}),
					h('div', { class: 'flex-1' }, [
						h('strong', { class: 'font-semibold text-gray-900 dark:text-white block mb-1' }, config.title),
						node.children,
					]),
				]
			),
		]
	);
}
