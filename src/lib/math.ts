export const roundNumber = (x: number, decimals: number = 2): number => {
	return Math.round(x * (10 ** decimals)) / (10 ** decimals)
}
