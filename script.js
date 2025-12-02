// =================================================================
// 1. CONSTANTES E VARIÁVEIS DE ESTADO
// =================================================================
const IDEAL_AVANCO_MIN = 30; // mm/s
const IDEAL_AVANCO_MAX = 35; // mm/s
const IDEAL_OSCILACAO_MIN = 60; // Hz
const IDEAL_OSCILACAO_MAX = 65; // Hz

const PIXEL_TO_MM = 0.5; // Escala: 1 pixel = 0.5 mm
const GUIDE_AMPLITUDE = 20; // Amplitude da onda guia em pixels (eixo Y)
const GUIDE_FREQUENCY_X = 0.08; // Frequência da onda ao longo do eixo X (quantas repetições)
const CENTER_Y = 200; // Centro do canvas (400 / 2)

let lastX = 0;
let lastY = 0;
let lastTime = 0;
let totalTimeInIdealZone = 0;
let totalTimeInTrackingZone = 0;
let totalTimePlayed = 0;
let isGameRunning = true;

// Variáveis para Cálculo da Frequência de Oscilação
let yPeaks = [];
const PEAK_DETECTION_WINDOW = 200; // ms (janela para detecção de pico)

// Elementos do DOM
const canvas = document.getElementById('welding-canvas');
const ctx = canvas.getContext('2d');

// =================================================================
// 2. FUNÇÕES DE INICIALIZAÇÃO E LOOP
// =================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Definir a posição inicial da 'tocha'
    lastX = canvas.width / 10;
    lastY = CENTER_Y;
    lastTime = performance.now();
    
    // Configurar o cursor para começar
    canvas.addEventListener('mousemove', handleMouseMove);
    
    // Iniciar o loop principal de atualização (desenho)
    requestAnimationFrame(gameLoop);
});

function gameLoop() {
    // Redesenha as guias (importante para que o cordão desenhado fique por cima)
    drawGuideLines();
    // Você pode redesenhar o cordão de solda aqui se fosse um jogo baseado em "frames"
    
    if (isGameRunning) {
        // Continue o loop se o jogo estiver rodando
        requestAnimationFrame(gameLoop);
    }
}

// =================================================================
// 3. FUNÇÕES DE DESENHO (GUIAS E CORDÃO)
// =================================================================

function drawGuideLines() {
    // 1. Limpa a área de jogo para evitar rastros de movimento do mouse (opcional, mas recomendado)
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Desenhar a Onda Senoidal (Guia de Oscilação)
    ctx.strokeStyle = '#44A044'; // Cor verde para o guia de movimento ideal
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]); // Linha tracejada
    
    ctx.beginPath();
    ctx.moveTo(0, CENTER_Y);

    for (let x = 0; x < canvas.width; x++) {
        const y = CENTER_Y + GUIDE_AMPLITUDE * Math.sin(x * GUIDE_FREQUENCY_X);
        ctx.lineTo(x, y);
    }
    
    ctx.stroke();
    ctx.setLineDash([]); // Resetar o tracejado
}

function calculateCordaoWidth(v_avanço, f_oscilacao) {
    let baseWidth = 8; // Largura ideal em pixels
    
    // Regras de irregularidade (Fino/Grosso)
    if (v_avanço > IDEAL_AVANCO_MAX * 1.5) {
        baseWidth = 4; // Fino demais (Avanço Rápido)
    } else if (v_avanço < IDEAL_AVANCO_MIN * 0.5) {
        baseWidth = 12; // Grosso demais (Avanço Lento)
    } else if (f_oscilacao < IDEAL_OSCILACAO_MIN * 0.5) {
        baseWidth = 10; // Larga e irregular (Oscilação Lenta)
    } else if (f_oscilacao > IDEAL_OSCILACAO_MAX * 1.5) {
        baseWidth = 6; // Estreita e irregular (Oscilação Rápida/Pequena)
    }
    
    return baseWidth;
}

function drawWeldBead(x1, y1, x2, y2, width, v_avanço, f_oscilacao) {
    // 1. Definição da Cor (Feedback Visual Imediato)
    let color = '#FFA500'; // Laranja padrão
    let opacity = 0.8;

    const isAvançoIdeal = isIdeal(v_avanço, IDEAL_AVANCO_MIN, IDEAL_AVANCO_MAX);
    const isOscilacaoIdeal = isIdeal(f_oscilacao, IDEAL_OSCILACAO_MIN, IDEAL_OSCILACAO_MAX);

    if (isAvançoIdeal && isOscilacaoIdeal) {
        color = '#3CB371'; // Verde (Qualidade Ideal)
    } else if (!isAvançoIdeal) {
        color = '#FF4500'; // Vermelho (Avanço Fora)
        opacity = 1.0;
    } else if (!isOscilacaoIdeal) {
        color = '#FFD700'; // Amarelo (Oscilação Fora)
    }

    // 2. Desenho do Cordão
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1.0; // Resetar opacidade
}

// =================================================================
// 4. LÓGICA DE MOVIMENTO E CÁLCULO
// =================================================================

function handleMouseMove(e) {
    if (!isGameRunning) {
        return; 
    }

    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000; // Tempo em segundos
    if (deltaTime === 0) return;

    // --- 1. Cálculo da Velocidade de Avanço (Linear no eixo X)
    const deltaX_pixels = e.offsetX - lastX;
    const deltaX_mm = deltaX_pixels * PIXEL_TO_MM;
    const v_avanço = Math.abs(deltaX_mm / deltaTime); // mm/s

    // --- 2. Cálculo da Frequência de Oscilação (Y)
    const deltaY = e.offsetY - lastY;
    if (Math.abs(deltaY) > 5) { 
        if ((deltaY > 0 && lastY <= e.offsetY) || (deltaY < 0 && lastY >= e.offsetY)) {
            yPeaks.push(currentTime);
            while (yPeaks.length > 0 && currentTime - yPeaks[0] > 1000) { // Janela de 1s
                yPeaks.shift();
            }
        }
    }
    
    let f_oscilacao = 0;
    if (yPeaks.length >= 2) {
        const timeElapsed = (yPeaks[yPeaks.length - 1] - yPeaks[0]) / 1000;
        const numCycles = yPeaks.length - 1;
        f_oscilacao = numCycles / timeElapsed; // Hz
    }

    // --- 3. Desenho do Cordão e Feedback
    const cordaoWidth = calculateCordaoWidth(v_avanço, f_oscilacao);
    drawWeldBead(lastX, lastY, e.offsetX, e.offsetY, cordaoWidth, v_avanço, f_oscilacao);
    updateHUD(v_avanço, f_oscilacao);
    updateScore(e.offsetY, e.offsetX);

    // --- 4. Atualizar variáveis para o próximo frame
    lastX = e.offsetX;
    lastY = e.offsetY;
    lastTime = currentTime;
    totalTimePlayed += deltaTime;
    
    // Lógica de Parada (Fim do Jogo)
    const END_THRESHOLD = canvas.width * 0.95;
    if (lastX >= END_THRESHOLD) {
        isGameRunning = false;
        canvas.removeEventListener('mousemove', handleMouseMove); // Para o rastreamento
        showFinalScore(); 
    }
}

// =================================================================
// 5. FUNÇÕES DE PONTUAÇÃO E FEEDBACK
// =================================================================

function isIdeal(value, min, max) {
    return value >= min && value <= max;
}

function getIdealTrackingY(x) {
    // Calcula a posição Y ideal da onda senoidal para um dado X
    return CENTER_Y + GUIDE_AMPLITUDE * Math.sin(x * GUIDE_FREQUENCY_X);
}

function updateScore(currentY, currentX) {
    const deltaTime = (performance.now() - lastTime) / 1000;

    // 1. Pontuação de Qualidade (Avanço + Oscilação)
    const v_avanço = parseFloat(document.getElementById('avanço-value').textContent);
    const f_oscilacao = parseFloat(document.getElementById('oscilação-value').textContent);

    if (isIdeal(v_avanço, IDEAL_AVANCO_MIN, IDEAL_AVANCO_MAX) && 
        isIdeal(f_oscilacao, IDEAL_OSCILACAO_MIN, IDEAL_OSCILACAO_MAX)) {
        totalTimeInIdealZone += deltaTime;
    }
    
    const qualityPercentage = (totalTimeInIdealZone / totalTimePlayed) * 100 || 0;
    document.getElementById('quality-score').textContent = `${Math.min(100, qualityPercentage).toFixed(0)}%`;


    // 2. Pontuação de Rastreamento (Proximidade com a Onda Guia)
    const idealY = getIdealTrackingY(currentX);
    const trackingError = Math.abs(currentY - idealY);
    const TRACKING_TOLERANCE = 10; // Pixels de margem de erro
    
    if (trackingError <= TRACKING_TOLERANCE) {
        totalTimeInTrackingZone += deltaTime;
    }

    const trackingPercentage = (totalTimeInTrackingZone / totalTimePlayed) * 100 || 0;
    document.getElementById('tracking-score').textContent = `${Math.min(100, trackingPercentage).toFixed(0)}%`;
}

function updateHUD(v_avanço, f_oscilacao) {
    const avancoValueElement = document.getElementById('avanço-value');
    const oscilacaoValueElement = document.getElementById('oscilação-value');
    
    avancoValueElement.textContent = v_avanço.toFixed(1);
    oscilacaoValueElement.textContent = f_oscilacao.toFixed(1);

    // Feedback visual do Avanço
    avancoValueElement.className = 'value ' + (isIdeal(v_avanço, IDEAL_AVANCO_MIN, IDEAL_AVANCO_MAX) ? 'ideal' : 
                                  (v_avanço > IDEAL_AVANCO_MAX ? 'too-fast' : 'too-slow'));
    
    // Feedback visual da Oscilação
    oscilacaoValueElement.className = 'value ' + (isIdeal(f_oscilacao, IDEAL_OSCILACAO_MIN, IDEAL_OSCILACAO_MAX) ? 'ideal' : 
                                  (f_oscilacao > IDEAL_OSCILACAO_MAX ? 'too-fast' : 'too-slow'));
}

function showFinalScore() {
    updateScore(lastY, lastX); // Garante a última atualização da pontuação
    
    const finalQuality = parseFloat(document.getElementById('quality-score').textContent);
    const finalTracking = parseFloat(document.getElementById('tracking-score').textContent);

    let message = '';
    if (finalQuality >= 90 && finalTracking >= 90) {
        message = "EXCELENTE! Coordenação perfeita e rastreamento impecável.";
    } else if (finalQuality >= 70 && finalTracking >= 70) {
        message = "MUITO BOM! Resultados consistentes. Pequenos ajustes finais.";
    } else {
        message = "PRECISA MELHORAR. Revise a consistência do seu avanço e oscilação.";
    }

    // Exibe a pontuação e mensagem no painel HUD
    const finalMessageElement = document.getElementById('final-message');
    finalMessageElement.innerHTML = `
        <h4 style="color: #00bcd4;">--- PERCURSO FINALIZADO ---</h4>
        <p>Qualidade Final: <span class="ideal">${finalQuality}%</span></p>
        <p>Rastreamento Final: <span class="ideal">${finalTracking}%</span></p>
        <p style="font-weight: bold; margin-top: 10px;">${message}</p>
    `;
    finalMessageElement.style.display = 'block';
    
    // Opcional: Desenha uma mensagem final no canvas também
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height); 
    ctx.font = '36px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText("SIMULAÇÃO CONCLUÍDA!", canvas.width / 2, canvas.height / 2);
}
