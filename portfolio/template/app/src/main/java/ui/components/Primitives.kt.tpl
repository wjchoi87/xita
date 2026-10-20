package __PKG__.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import __PKG__.ui.theme.AppType
import __PKG__.ui.theme.LocalAppTokens
import __PKG__.ui.theme.Radius
import __PKG__.ui.theme.Space

/**
 * 표면 그룹.
 *
 * Material `Card`를 쓰지 않는다. 카드를 기본값으로 삼으면 화면이 그림자 더미가 되고
 * 모든 요소가 똑같이 자기주장을 한다. 여기서는 **배경 명도차 + 1px 보더**로만 구분한다.
 * 그림자는 실제로 떠 있는 것(모달·시트·팝오버)에만 쓴다.
 */
@Composable
fun Panel(
    modifier: Modifier = Modifier,
    tone: PanelTone = PanelTone.Surface,
    content: @Composable ColumnScope.() -> Unit
) {
    val t = LocalAppTokens.current
    val bg = when (tone) {
        PanelTone.Surface -> t.surface
        PanelTone.Subtle -> t.subtle
        PanelTone.Brand -> t.brand
    }
    val borderColor = when (tone) {
        PanelTone.Brand -> Color.Transparent
        else -> t.border
    }

    Column(
        modifier = modifier
            .clip(RoundedCornerShape(Radius.surface))
            .background(bg)
            .then(
                if (borderColor == Color.Transparent) Modifier
                else Modifier.border(1.dp, borderColor, RoundedCornerShape(Radius.surface))
            ),
        content = content
    )
}

enum class PanelTone { Surface, Subtle, Brand }

/**
 * 섹션 제목.
 *
 * 제목은 자기 **아래** 콘텐츠에 붙는다. 위 여백이 아래 여백보다 커야
 * 어느 그룹에 속한 제목인지 한눈에 읽힌다. (DESIGN.md 4.4)
 */
@Composable
fun SectionTitle(
    text: String,
    modifier: Modifier = Modifier,
    caption: String? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null
) {
    val t = LocalAppTokens.current
    Column(modifier = modifier.padding(top = Space.xl, bottom = Space.md)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(text, style = AppType.h3, color = t.textPrimary, modifier = Modifier.weight(1f))
            trailing?.invoke(this)
        }
        if (caption != null) {
            Spacer(Modifier.height(Space.xs))
            Text(caption, style = AppType.bodySm, color = t.textSecondary)
        }
    }
}

/**
 * 라벨-값 한 줄.
 *
 * 값은 tabular 숫자 스타일을 쓴다. 라벨과 값의 색을 분리해 위계를 만든다.
 * 값이 길어지면 라벨이 아니라 값이 줄어든다(값은 끝까지 보이는 게 더 중요).
 */
@Composable
fun DataRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color? = null,
    mono: Boolean = false
) {
    val t = LocalAppTokens.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .padding(horizontal = Space.lg, vertical = Space.md),
        horizontalArrangement = Arrangement.spacedBy(Space.md),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = AppType.body,
            color = t.textSecondary,
            modifier = Modifier.weight(1f),
            overflow = TextOverflow.Ellipsis,
            maxLines = 2
        )
        Text(
            text = value,
            style = if (mono) AppType.mono else AppType.numeric,
            color = valueColor ?: t.textPrimary,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(1.1f),
            overflow = TextOverflow.Ellipsis,
            maxLines = 2
        )
    }
}

/** 패널 안 항목 구분선. 콘텐츠 시작선에 맞춰 들여쓴다. */
@Composable
fun RowDivider(inset: Boolean = true) {
    val t = LocalAppTokens.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = if (inset) Space.lg else 0.dp)
            .height(1.dp)
            .background(t.border)
    )
}

/**
 * 화면 주인공 숫자.
 *
 * 값과 단위를 **분리**해서 크기·색으로 위계를 만든다.
 * "150,000원"을 한 덩어리로 그리면 숫자가 안 읽히고 밋밋해진다.
 */
@Composable
fun StatBlock(
    value: String,
    unit: String?,
    label: String?,
    modifier: Modifier = Modifier,
    valueColor: Color? = null,
    display: Boolean = false
) {
    val t = LocalAppTokens.current
    Column(modifier = modifier) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                text = value,
                style = if (display) AppType.numericDisplay else AppType.numericLarge,
                color = valueColor ?: t.textPrimary
            )
            if (unit != null) {
                Spacer(Modifier.width(Space.xs))
                Text(
                    text = unit,
                    style = AppType.body,
                    color = t.textMuted,
                    modifier = Modifier.padding(bottom = if (display) 10.dp else 4.dp)
                )
            }
        }
        if (label != null) {
            Spacer(Modifier.height(Space.xs))
            Text(label, style = AppType.bodySm, color = t.textSecondary)
        }
    }
}

/**
 * 빈 화면.
 *
 * 3요소(왜 비었는지 / 채우면 뭐가 좋은지 / 채우는 버튼)를 **파라미터로 강제**한다.
 * "데이터가 없습니다" 한 줄로 끝내는 화면을 코드 수준에서 막기 위함이다.
 */
@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    description: String,
    actionLabel: String?,
    onAction: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    val t = LocalAppTokens.current
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = Space.xl),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .clip(RoundedCornerShape(Radius.surface))
                .background(t.subtle),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = t.textMuted, modifier = Modifier.size(28.dp))
        }
        Spacer(Modifier.height(Space.lg))
        Text(title, style = AppType.h3, color = t.textPrimary, textAlign = TextAlign.Center)
        Spacer(Modifier.height(Space.sm))
        Text(
            description,
            style = AppType.bodySm,
            color = t.textSecondary,
            textAlign = TextAlign.Center
        )
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(Space.xl))
            PrimaryAction(text = actionLabel, onClick = onAction)
        }
    }
}

/**
 * 주 액션. 화면당 **하나만** 쓴다.
 *
 * Material `Button`을 직접 쓰지 않는 이유: 기본 스타일이 화면마다 미묘하게 달라지고,
 * 여러 개를 나란히 두는 실수를 막을 장치가 없다.
 */
@Composable
fun PrimaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null
) {
    val t = LocalAppTokens.current
    val bg = if (enabled) t.brand else t.subtle
    val fg = if (enabled) t.onBrand else t.textMuted

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(Radius.control))
            .background(bg)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = Space.lg),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(Space.sm))
        }
        Text(text, style = AppType.label, color = fg)
    }
}

/** 보조 액션. 주 액션과 절대 같은 무게로 보이지 않게 한다. */
@Composable
fun SecondaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    danger: Boolean = false
) {
    val t = LocalAppTokens.current
    val fg = when {
        !enabled -> t.textMuted
        danger -> t.danger
        else -> t.textPrimary
    }

    Row(
        modifier = modifier
            .height(48.dp)
            .clip(RoundedCornerShape(Radius.control))
            .border(1.dp, t.border, RoundedCornerShape(Radius.control))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = Space.lg),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(text, style = AppType.label, color = fg)
    }
}

/**
 * 고지·경고 배너.
 *
 * 색만으로 상태를 표현하지 않는다. **색 + 아이콘 + 텍스트** 3중 표현을 구조로 강제한다.
 * grayscale로 바꿔도, 색약 사용자에게도 의미가 전달돼야 한다. (DESIGN.md P3)
 */
@Composable
fun NoticeBanner(
    icon: ImageVector,
    title: String?,
    message: String,
    tone: NoticeTone,
    modifier: Modifier = Modifier
) {
    val t = LocalAppTokens.current
    val (bg, fg) = when (tone) {
        NoticeTone.Info -> t.subtle to t.textSecondary
        NoticeTone.Warning -> t.warningSubtle to t.warning
        NoticeTone.Danger -> t.dangerSubtle to t.danger
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.surface))
            .background(bg)
            .padding(Space.lg),
        horizontalArrangement = Arrangement.spacedBy(Space.md)
    ) {
        Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
        Column {
            if (title != null) {
                Text(title, style = AppType.label, color = fg)
                Spacer(Modifier.height(Space.xs))
            }
            Text(
                message,
                style = AppType.bodySm,
                color = if (tone == NoticeTone.Info) t.textSecondary else fg
            )
        }
    }
}

enum class NoticeTone { Info, Warning, Danger }

/**
 * 세그먼트 선택기.
 *
 * Material `FilterChip` 나열 대신 쓴다. 칩을 늘어놓으면 "여러 개 고를 수 있나?"로 읽히는데
 * 실제로는 하나만 고르는 모드 전환인 경우가 대부분이라 의미가 어긋난다.
 */
@Composable
fun SegmentedSelector(
    options: List<String>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    val t = LocalAppTokens.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Radius.control))
            .background(t.subtle)
            .padding(3.dp)
    ) {
        options.forEachIndexed { index, option ->
            val selected = index == selectedIndex
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(38.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (selected) t.surface else Color.Transparent)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { onSelect(index) },
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = option,
                    style = AppType.label,
                    color = if (selected) t.textPrimary else t.textSecondary
                )
            }
        }
    }
}

/** 상태 배지. 색 + 텍스트 이중 표현. */
@Composable
fun StatusBadge(
    text: String,
    tone: NoticeTone,
    modifier: Modifier = Modifier
) {
    val t = LocalAppTokens.current
    val (bg, fg) = when (tone) {
        NoticeTone.Info -> t.subtle to t.textSecondary
        NoticeTone.Warning -> t.warningSubtle to t.warning
        NoticeTone.Danger -> t.dangerSubtle to t.danger
    }
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(percent = 50))
            .background(bg)
            .padding(horizontal = Space.md, vertical = 5.dp)
    ) {
        Text(text, style = AppType.caption, color = fg)
    }
}
