import type { MatchStats } from "./match-summary.ts";

export interface ResultCardInput {
  outcome: "win" | "draw" | "loss";
  outcomeText: string;
  title: string;
  summary: string;
  grade: string;
  gradeLabel: string;
  style: string;
  quote: string;
  modeLabel: string;
  round: number;
  playerName: string;
  opponentName: string;
  weaponName: string;
  weaponImage: string;
  weaponUses: number;
  ownHealth: number;
  opponentHealth: number;
  stats: MatchStats;
  footer: string;
}

const WIDTH = 1080;
const HEIGHT = 1440;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawHexagon(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.beginPath();
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 3 * index + Math.PI / 6;
    const pointX = x + radius * Math.cos(angle);
    const pointY = y + radius * Math.sin(angle);
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
}

function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const characters = Array.from(text);
  const lines: string[] = [];
  let line = "";
  for (const character of characters) {
    const candidate = `${line}${character}`;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && characters.join("") !== lines.join("")) {
    let last = lines[maxLines - 1];
    while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  lines.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
}

function drawStat(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  label: string,
) {
  roundedRect(context, x, y, 210, 150, 20);
  context.fillStyle = "rgba(20, 29, 38, .92)";
  context.fill();
  context.strokeStyle = "rgba(150, 166, 178, .18)";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = "#f1eee7";
  context.font = "700 52px sans-serif";
  context.textAlign = "center";
  context.fillText(value, x + 105, y + 66);
  context.fillStyle = "#77838d";
  context.font = "400 25px sans-serif";
  context.fillText(label, x + 105, y + 112);
}

export async function createResultCard(input: ResultCardInput): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");

  const palette = input.outcome === "win"
    ? { accent: "#efc56d", glow: "rgba(239,197,109,.28)", glyph: "胜" }
    : input.outcome === "draw"
      ? { accent: "#66d7df", glow: "rgba(102,215,223,.24)", glyph: "和" }
      : { accent: "#ef766a", glow: "rgba(239,118,106,.23)", glyph: "败" };

  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, "#111a22");
  background.addColorStop(.48, "#080d13");
  background.addColorStop(1, "#111720");
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.save();
  context.globalAlpha = .22;
  context.strokeStyle = "#62717d";
  context.lineWidth = 2;
  for (let row = -1; row < 12; row += 1) {
    for (let column = -1; column < 8; column += 1) {
      const offset = row % 2 ? 72 : 0;
      drawHexagon(context, column * 144 + offset, row * 125, 82);
      context.stroke();
    }
  }
  context.restore();

  const glow = context.createRadialGradient(540, 370, 10, 540, 370, 460);
  glow.addColorStop(0, palette.glow);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, WIDTH, 850);

  context.fillStyle = palette.accent;
  context.fillRect(72, 68, 116, 5);
  context.fillStyle = "#8a969f";
  context.font = "500 25px monospace";
  context.textAlign = "left";
  context.fillText("MULTI·WAR / MATCH REPORT", 72, 116);
  context.textAlign = "right";
  context.fillStyle = palette.accent;
  context.fillText(String(input.round).padStart(2, "0"), 1008, 116);

  context.save();
  context.shadowColor = palette.glow;
  context.shadowBlur = 42;
  context.fillStyle = "rgba(8, 13, 18, .82)";
  context.strokeStyle = palette.accent;
  context.lineWidth = 4;
  context.beginPath();
  context.arc(540, 276, 112, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
  context.fillStyle = palette.accent;
  context.textAlign = "center";
  context.font = "800 104px sans-serif";
  context.fillText(palette.glyph, 540, 314);

  roundedRect(context, 864, 216, 144, 128, 20);
  context.fillStyle = "rgba(8, 13, 18, .82)";
  context.fill();
  context.strokeStyle = "rgba(239,197,109,.32)";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = palette.accent;
  context.font = "800 62px sans-serif";
  context.fillText(input.grade, 936, 276);
  context.fillStyle = "#7b878f";
  context.font = "400 20px sans-serif";
  context.fillText(input.gradeLabel, 936, 314);

  context.fillStyle = "#f4f1e9";
  context.font = "700 70px sans-serif";
  context.fillText(input.outcomeText, 540, 478);
  context.fillStyle = "#74808a";
  context.font = "400 27px sans-serif";
  context.fillText(`第 ${input.round} 回合结束  ·  ${input.modeLabel}  ·  #${input.style}`, 540, 526);

  roundedRect(context, 72, 580, 936, 174, 24);
  context.fillStyle = "rgba(239,197,109,.08)";
  context.fill();
  context.fillStyle = palette.accent;
  context.fillRect(72, 580, 5, 174);
  context.textAlign = "left";
  context.fillStyle = "#f0d18d";
  context.font = "700 42px sans-serif";
  context.fillText(input.title, 110, 642);
  context.fillStyle = "#87929c";
  context.font = "400 25px sans-serif";
  context.fillText(input.summary, 110, 686);
  context.fillStyle = "#d8d2c6";
  context.font = "500 27px sans-serif";
  drawWrappedText(context, `“${input.quote}”`, 110, 728, 850, 36, 1);

  roundedRect(context, 72, 792, 936, 224, 24);
  context.fillStyle = "rgba(12, 19, 26, .94)";
  context.fill();
  context.strokeStyle = "rgba(150, 166, 178, .2)";
  context.lineWidth = 2;
  context.stroke();
  const weaponImage = await loadImage(input.weaponImage);
  if (weaponImage) {
    const imageSize = 190;
    context.drawImage(weaponImage, 94, 809, imageSize, imageSize);
  } else {
    context.fillStyle = "rgba(239,197,109,.12)";
    context.beginPath();
    context.arc(190, 904, 78, 0, Math.PI * 2);
    context.fill();
  }
  context.textAlign = "left";
  context.fillStyle = "#77838d";
  context.font = "400 24px sans-serif";
  context.fillText("本局主力武器", 320, 850);
  context.fillStyle = "#f1eee7";
  context.font = "700 52px sans-serif";
  context.fillText(input.weaponName, 320, 915);
  context.fillStyle = palette.accent;
  context.font = "500 26px sans-serif";
  context.fillText(`使用 ${input.weaponUses} 次  ·  ${input.playerName}`, 320, 969);

  drawStat(context, 72, 1052, String(input.round), "交战回合");
  drawStat(context, 310, 1052, `${input.stats.hits}/${input.stats.diceRolls}`, "骰子命中");
  drawStat(context, 548, 1052, String(input.stats.damage), "累计伤害");
  drawStat(context, 786, 1052, input.stats.maxRoll ? String(input.stats.maxRoll) : "—", "最高骰点");

  context.textAlign = "center";
  context.fillStyle = "#aeb6bc";
  context.font = "500 27px sans-serif";
  context.fillText(`${input.playerName}  ${input.ownHealth} HP    :    ${input.opponentName}  ${input.opponentHealth} HP`, 540, 1260);
  context.fillStyle = "#f2cf7d";
  context.font = "700 34px sans-serif";
  context.fillText("搜打撤｜猜走位 · 拆退路 · 赌骰子", 540, 1328);
  context.fillStyle = "#64717b";
  context.font = "400 24px sans-serif";
  context.fillText(input.footer, 540, 1376);

  return canvas.toDataURL("image/png");
}
