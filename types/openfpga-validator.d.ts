declare module "openfpga-validator/lib" {
  export function processZip(
    zipPath: string,
    options: { failOnWarnings: boolean; failOnRecommendations: boolean },
    chalk?: boolean,
  ): Promise<number>;
}
