import { writable } from 'svelte/store'

export enum NotificationType {
	info,
	error,
	warning,
}

export interface NotificationMessage {
	id?: number
	message: string
	type: NotificationType
	timeout: number
}

export const notification = writable<NotificationMessage | undefined>(undefined)

export const showNotification = (message: string, type: NotificationType = NotificationType.info, timeout = 5000) => {
	notification.set({ message, type, timeout })
}
