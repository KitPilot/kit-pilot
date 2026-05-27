import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useTranslation } from "react-i18next"
import { Trans } from "react-i18next"

import { buildDocLink } from "@src/utils/docLinks"

const KitPilotTips = () => {
	const { t } = useTranslation("chat")

	return (
		<div className="mb-6 max-w-[500px]">
			<div className="flex flex-col gap-3 rounded-md border border-vscode-panel-border/40 bg-vscode-input-background/60 px-5 py-4">
				<h2 className="m-0 text-lg font-medium text-vscode-foreground tracking-tight">
					<Trans i18nKey="chat:about" />
				</h2>
				<p className="m-0 text-sm text-vscode-descriptionForeground leading-relaxed">
					{t("kitpilotTips.modelAgnostic.description")}
				</p>
				<p className="m-0 text-sm text-vscode-descriptionForeground">
					<Trans
						i18nKey="chat:docs"
						components={{
							DocsLink: (
								<VSCodeLink
									className="text-muted-foreground underline"
									href={buildDocLink("", "welcome")}
								/>
							),
						}}
					/>
				</p>
			</div>
		</div>
	)
}

export default KitPilotTips
