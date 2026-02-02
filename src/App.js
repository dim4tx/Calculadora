import React, { useState, useEffect } from 'react';
import { Calendar, Save, ChevronRight, ChevronLeft, Edit2, X, Check, Download, Cloud, Trash2 } from 'lucide-react';
import { db, auth } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const App = () => {
  const [currentView, setCurrentView] = useState('paso1');
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const [showMonthlyHistory, setShowMonthlyHistory] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({
    paso1: false,
    paso2: false
  });
  
  const [currentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isDayCompleted, setIsDayCompleted] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(currentDate.slice(0, 7));
  const [isLastDayOfMonth, setIsLastDayOfMonth] = useState(false);
  
  const [todayData, setTodayData] = useState({
    date: currentDate,
    paso1: { 
      dato1: '', 
      dato2: '', 
      total: 0, 
      acumuladoAnterior: 0, 
      acumulado: 0,
      totalDiaAnterior: 0 
    },
    paso2: { 
      dato1: '', 
      dato2: '', 
      total: 0, 
      acumuladoAnterior: 0, 
      acumulado: 0,
      totalDiaAnterior: 0 
    },
    porcentaje: 0
  });

  const [historicalData, setHistoricalData] = useState({});
  const [monthlyData, setMonthlyData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [cloudStatus, setCloudStatus] = useState('⏳ Conectando...');

  // ===================== FUNCIONES JSON SIMPLIFICADAS =====================
  const exportAllDataToJSON = () => {
    try {
      const exportData = {
        fechaExportacion: new Date().toISOString(),
        aplicacion: 'Calculadora Diaria',
        datosDiarios: historicalData,
        resumenesMensuales: monthlyData,
        estadisticas: {
          totalDias: Object.keys(historicalData).length,
          totalMeses: Object.keys(monthlyData).length,
          ultimoMes: currentMonth,
          diaActualCompletado: isDayCompleted
        }
      };
      
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `backup_datos_${currentDate}.json`;
      link.click();
      
      alert(`✅ Backup exportado exitosamente!\n\n📊 Contenido:\n• ${Object.keys(historicalData).length} días registrados\n• ${Object.keys(monthlyData).length} meses resumidos\n\n💾 Archivo: backup_datos_${currentDate}.json`);
      
    } catch (error) {
      console.error('Error exportando JSON:', error);
      alert('❌ Error al exportar los datos. Intenta nuevamente.');
    }
  };

  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        setCloudStatus('⏳ Importando backup...');
        const importedData = JSON.parse(e.target.result);
        
        console.log('📥 Datos importados:', importedData);
        
        let datosImportados = importedData.datosDiarios || importedData.historicalData || importedData;
        let resumenesImportados = importedData.resumenesMensuales || importedData.monthlyData || {};
        
        if (Object.keys(datosImportados).length === 0) {
          throw new Error('El archivo no contiene datos válidos');
        }
        
        setHistoricalData(datosImportados);
        setMonthlyData(resumenesImportados);
        
        if (datosImportados[currentDate]) {
          const datosHoy = datosImportados[currentDate];
          setTodayData(datosHoy);
          setIsDayCompleted(true);
          setCompletedSteps({ paso1: true, paso2: true });
          setCurrentView('resumen');
          
          alert(`✅ Backup importado exitosamente!\n\n📊 Se encontraron datos para hoy (${currentDate}).\nLos datos se cargaron en modo solo lectura.`);
        } else {
          const fechas = Object.keys(datosImportados).sort();
          if (fechas.length > 0) {
            const ultimaFecha = fechas[fechas.length - 1];
            const ultimosDatos = datosImportados[ultimaFecha];
            
            setTodayData({
              date: currentDate,
              paso1: {
                dato1: '',
                dato2: '',
                total: 0,
                acumuladoAnterior: ultimosDatos.paso1.acumulado || 0,
                acumulado: ultimosDatos.paso1.acumulado || 0,
                totalDiaAnterior: ultimosDatos.paso1.total || 0
              },
              paso2: {
                dato1: '',
                dato2: '',
                total: 0,
                acumuladoAnterior: ultimosDatos.paso2.acumulado || 0,
                acumulado: ultimosDatos.paso2.acumulado || 0,
                totalDiaAnterior: ultimosDatos.paso2.total || 0
              },
              porcentaje: 0
            });
            
            alert(`✅ Backup importado exitosamente!\n\n📊 ${fechas.length} días importados.\n📅 Último día registrado: ${ultimaFecha}\n\n💡 Puedes continuar registrando desde hoy.`);
          } else {
            alert(`✅ Backup importado exitosamente!\n\n💡 Puedes comenzar a registrar datos desde hoy.`);
          }
          
          setIsDayCompleted(false);
          setCompletedSteps({ paso1: false, paso2: false });
          setCurrentView('paso1');
        }
        
        setCloudStatus('✅ Backup importado - Listo');
        
      } catch (error) {
        console.error('Error importando JSON:', error);
        setCloudStatus('❌ Error al importar');
        alert(`❌ Error al importar el backup:\n\n${error.message}\n\n💡 Asegúrate de usar un archivo exportado desde esta aplicación.`);
      }
    };
    
    reader.readAsText(file);
  };

  // ===================== FUNCIÓN NUEVA: EXPORTAR SOLO RESÚMENES MENSUALES REGISTRADOS =====================
const exportMonthlySummaries = () => {
  try {
    // Filtrar solo los meses que tienen datos consolidados en monthlyData
    const mesesRegistrados = Object.keys(monthlyData)
      .filter(monthKey => {
        const data = monthlyData[monthKey];
        return data && 
               (data.informacionConsolidada?.diasTotales > 0 || 
                data.totalesPorDia?.paso1 > 0 || 
                data.totalesPorDia?.paso2 > 0);
      })
      .sort();
    
    if (mesesRegistrados.length === 0) {
      alert("ℹ️ No hay meses registrados para exportar. Los meses se registran automáticamente al final de cada mes o puedes consolidarlos desde el historial.");
      return;
    }
    
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Calculadora Diaria App';
    workbook.created = new Date();
    
    const summarySheet = workbook.addWorksheet('Resumen Mensual General');
    
    // Configurar anchos de columna
    summarySheet.getColumn(1).width = 15;
    summarySheet.getColumn(2).width = 20;
    summarySheet.getColumn(3).width = 20;
    summarySheet.getColumn(4).width = 20;
    summarySheet.getColumn(5).width = 20;
    summarySheet.getColumn(6).width = 15;
    
    // Título
    const titleRow = summarySheet.addRow(['RESUMEN DE MESES YA REGISTRADOS EN LA BASE DE DATOS']);
    titleRow.font = { bold: true, size: 16, color: { argb: '1F4E78' } };
    titleRow.alignment = { horizontal: 'center' };
    summarySheet.mergeCells('A1:F1');
    
    // Información de exportación
    summarySheet.addRow(['Fecha de exportación:', new Date().toLocaleDateString('es-CO')]);
    summarySheet.addRow(['Total de meses registrados:', mesesRegistrados.length]);
    summarySheet.addRow(['Estado del mes actual:', isDayCompleted ? '✅ Completado' : '⏳ En progreso']);
    summarySheet.addRow([]);
    
    // Encabezados
    const headers = summarySheet.addRow([
      'Mes',
      'Días Registrados',
      'Total Paso 1',
      'Total Paso 2',
      'Total General',
      'Porcentaje'
    ]);
    
    headers.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '7030A0' }
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      cell.alignment = { horizontal: 'center' };
    });
    
    let totalDias = 0;
    let totalPaso1 = 0;
    let totalPaso2 = 0;
    let totalGeneral = 0;
    
    // Agregar datos de cada mes
    mesesRegistrados.forEach((monthKey, index) => {
      const data = monthlyData[monthKey];
      
      const diasTotales = data.informacionConsolidada?.diasTotales || 0;
      const totalMesPaso1 = data.totalesPorDia?.paso1 || data.acumuladoGeneral?.paso1 || 0;
      const totalMesPaso2 = data.totalesPorDia?.paso2 || data.acumuladoGeneral?.paso2 || 0;
      const totalMesGeneral = data.totalesPorDia?.general || (totalMesPaso1 + totalMesPaso2);
      const porcentajeFinal = data.porcentajeFinal || 0;
      
      totalDias += diasTotales;
      totalPaso1 += totalMesPaso1;
      totalPaso2 += totalMesPaso2;
      totalGeneral += totalMesGeneral;
      
      const row = summarySheet.addRow([
        monthKey,
        diasTotales,
        totalMesPaso1,
        totalMesPaso2,
        totalMesGeneral,
        porcentajeFinal / 100
      ]);
      
      // Alternar colores de fila para mejor legibilidad
      if (index % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F2F2F2' }
          };
        });
      }
      
      // Formato de números para las columnas de montos
      [3, 4, 5].forEach(colIndex => {
        const cell = row.getCell(colIndex);
        cell.numFmt = '#,##0';
      });
      
      // Formato de porcentaje
      const porcentajeCell = row.getCell(6);
      porcentajeCell.numFmt = '0.00%';
    });
    
    // Agregar fila de totales
    summarySheet.addRow([]);
    const totalsRow = summarySheet.addRow([
      'TOTALES',
      totalDias,
      totalPaso1,
      totalPaso2,
      totalGeneral,
      ''
    ]);
    
    totalsRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    totalsRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '2E75B6' }
    };
    
    [3, 4, 5].forEach(colIndex => {
      const cell = totalsRow.getCell(colIndex);
      cell.numFmt = '#,##0';
    });
    
    // Hoja de detalle por mes
    const detailSheet = workbook.addWorksheet('Detalle por Mes');
    
    // Configurar anchos de columna
    detailSheet.getColumn(1).width = 20;
    detailSheet.getColumn(2).width = 15;
    detailSheet.getColumn(3).width = 15;
    detailSheet.getColumn(4).width = 15;
    detailSheet.getColumn(5).width = 15;
    detailSheet.getColumn(6).width = 20;
    detailSheet.getColumn(7).width = 20;
    detailSheet.getColumn(8).width = 20;
    
    // Agregar datos detallados por mes
    mesesRegistrados.forEach((monthKey) => {
      const data = monthlyData[monthKey];
      
      // Título del mes
      const monthTitleRow = detailSheet.addRow([
        `MES: ${monthKey} - ${data.informacionConsolidada?.diasTotales || 0} días registrados`
      ]);
      monthTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
      detailSheet.mergeCells(`A${detailSheet.rowCount}:H${detailSheet.rowCount}`);
      
      // Encabezados de días
      const dayHeaders = detailSheet.addRow([
        'Fecha',
        'Día',
        'P1 Dato 1',
        'P1 Dato 2',
        'P1 Total',
        'P2 Dato 1',
        'P2 Dato 2',
        'P2 Total'
      ]);
      
      dayHeaders.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '4472C4' }
        };
      });
      
      // Agregar datos de cada día del mes
      if (data.diasRegistrados && data.diasRegistrados.length > 0) {
        data.diasRegistrados.forEach((dia, diaIndex) => {
          const fecha = new Date(dia.fecha + 'T00:00:00');
          const diaSemana = fecha.toLocaleDateString('es-CO', { weekday: 'short' });
          
          const row = detailSheet.addRow([
            dia.fecha,
            diaSemana,
            dia.paso1?.dato1 || 0,
            dia.paso1?.dato2 || 0,
            dia.paso1?.totalDia || 0,
            dia.paso2?.dato1 || 0,
            dia.paso2?.dato2 || 0,
            dia.paso2?.totalDia || 0
          ]);
          
          // Alternar colores
          if (diaIndex % 2 === 0) {
            row.eachCell((cell, colNumber) => {
              if (colNumber >= 1 && colNumber <= 8) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'E6F0FF' }
                };
              }
            });
          }
          
          // Formato numérico
          [3, 4, 5, 6, 7, 8].forEach(colIndex => {
            const cell = row.getCell(colIndex);
            cell.numFmt = '#,##0';
          });
        });
        
        // Agregar totales del mes
        const mesTotalsRow = detailSheet.addRow([
          `TOTAL ${monthKey}:`,
          '',
          `=SUM(C${detailSheet.rowCount - data.diasRegistrados.length}:C${detailSheet.rowCount - 1})`,
          `=SUM(D${detailSheet.rowCount - data.diasRegistrados.length}:D${detailSheet.rowCount - 1})`,
          `=SUM(E${detailSheet.rowCount - data.diasRegistrados.length}:E${detailSheet.rowCount - 1})`,
          `=SUM(F${detailSheet.rowCount - data.diasRegistrados.length}:F${detailSheet.rowCount - 1})`,
          `=SUM(G${detailSheet.rowCount - data.diasRegistrados.length}:G${detailSheet.rowCount - 1})`,
          `=SUM(H${detailSheet.rowCount - data.diasRegistrados.length}:H${detailSheet.rowCount - 1})`
        ]);
        
        mesTotalsRow.font = { bold: true };
        mesTotalsRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2CC' }
        };
        
        [3, 4, 5, 6, 7, 8].forEach(colIndex => {
          const cell = mesTotalsRow.getCell(colIndex);
          cell.numFmt = '#,##0';
        });
        
        detailSheet.addRow([]);
        detailSheet.addRow([]);
      }
    });
    
    // Guardar el archivo
    workbook.xlsx.writeBuffer().then(buffer => {
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const fileName = `resumen_meses_registrados_${currentDate}.xlsx`;
      saveAs(blob, fileName);
      
      alert(`✅ Resumen de meses registrados exportado exitosamente.\n\n📊 ${mesesRegistrados.length} meses exportados\n📁 Archivo: ${fileName}\n\n💡 Este archivo contiene SOLO los meses que ya están completados y registrados en la base de datos.`);
    });
    
  } catch (error) {
    console.error('Error al exportar resúmenes mensuales:', error);
    alert('❌ Error al exportar los resúmenes mensuales.');
  }
};

  // ===================== FUNCIÓN PRINCIPAL PARA EXPORTAR A EXCEL =====================
  const exportToExcel = (type = 'full') => {
    try {
      if (type === 'monthly' && (!monthlyData || Object.keys(monthlyData).length === 0)) {
        alert("No hay datos mensuales para exportar.");
        return;
      }

      if (type !== 'monthly' && (!historicalData || Object.keys(historicalData).length === 0)) {
        alert("No hay datos diarios para exportar.");
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Calculadora Diaria App';
      workbook.created = new Date();

      const dayDataForExport = isDayCompleted && historicalData[currentDate] 
        ? historicalData[currentDate] 
        : todayData;

      if (type === 'full' || type === 'today') {
        const todaySheet = workbook.addWorksheet('Día Actual');
        
        todaySheet.getColumn(1).width = 25;
        todaySheet.getColumn(2).width = 25;
        
        const todayTitleRow = todaySheet.addRow(['REPORTE DEL DÍA ACTUAL']);
        todayTitleRow.font = { bold: true, size: 16, color: { argb: '1F4E78' } };
        todayTitleRow.alignment = { horizontal: 'center' };
        todaySheet.mergeCells('A1:B1');

        todaySheet.addRow(['Fecha:', currentDate]);
        todaySheet.addRow(['Mes actual:', currentMonth]);
        todaySheet.addRow(['Estado:', isDayCompleted ? '✅ Día completado' : '⏳ Día en progreso']);
        todaySheet.addRow([]);

        const paso1Header = todaySheet.addRow(['PASO 1', '']);
        paso1Header.font = { bold: true, color: { argb: 'FFFFFF' } };
        paso1Header.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '2E75B6' }
        };
        todaySheet.mergeCells('A6:B6');

        todaySheet.addRow(['Dato 1:', formatCurrency(dayDataForExport.paso1.dato1).replace(/[^\d]/g, '')]);
        todaySheet.addRow(['Dato 2:', formatCurrency(dayDataForExport.paso1.dato2).replace(/[^\d]/g, '')]);
        todaySheet.addRow(['Total del día:', dayDataForExport.paso1.total || 0]);
        todaySheet.addRow(['Acumulado anterior:', dayDataForExport.paso1.acumuladoAnterior || 0]);
        todaySheet.addRow(['Acumulado del mes:', dayDataForExport.paso1.acumulado || 0]);
        todaySheet.addRow([]);

        const paso2Header = todaySheet.addRow(['PASO 2', '']);
        paso2Header.font = { bold: true, color: { argb: 'FFFFFF' } };
        paso2Header.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '70AD47' }
        };
        todaySheet.mergeCells('A13:B13');

        todaySheet.addRow(['Dato 1:', formatCurrency(dayDataForExport.paso2.dato1).replace(/[^\d]/g, '')]);
        todaySheet.addRow(['Dato 2:', formatCurrency(dayDataForExport.paso2.dato2).replace(/[^\d]/g, '')]);
        todaySheet.addRow(['Total del día:', dayDataForExport.paso2.total || 0]);
        todaySheet.addRow(['Acumulado anterior:', dayDataForExport.paso2.acumuladoAnterior || 0]);
        todaySheet.addRow(['Acumulado del mes:', dayDataForExport.paso2.acumulado || 0]);
        todaySheet.addRow([]);

        const resumenHeader = todaySheet.addRow(['RESUMEN GENERAL', '']);
        resumenHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
        resumenHeader.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '7030A0' }
        };
        todaySheet.mergeCells('A20:B20');

        const totalDia = (dayDataForExport.paso1.total || 0) + (dayDataForExport.paso2.total || 0);
        const totalAcumulado = (dayDataForExport.paso1.acumulado || 0) + (dayDataForExport.paso2.acumulado || 0);
        
        let porcentajeDia = 0;
        const totalPaso1 = dayDataForExport.paso1.total || 0;
        const totalPaso2 = dayDataForExport.paso2.total || 0;
        
        if (totalPaso1 > 0 && totalPaso2 > 0) {
          const menor = Math.min(totalPaso1, totalPaso2);
          const mayor = Math.max(totalPaso1, totalPaso2);
          porcentajeDia = (menor / mayor) * 100;
        }
        
        todaySheet.addRow(['Total del día (P1 + P2):', totalDia]);
        todaySheet.addRow(['Total acumulado (P1 + P2):', totalAcumulado]);
        todaySheet.addRow(['Porcentaje del día:', porcentajeDia / 100]);

        for (let i = 7; i <= 22; i++) {
          if (i !== 6 && i !== 13 && i !== 20) {
            const cell = todaySheet.getCell(`B${i}`);
            if (i !== 22) {
              cell.numFmt = '#,##0';
            }
          }
        }

        const porcentajeCell = todaySheet.getCell('B22');
        porcentajeCell.numFmt = '0.00%';
      }

      if (type === 'full' || type === 'daily') {
        const dailySheet = workbook.addWorksheet('Detalle Diario');

        dailySheet.getColumn(1).width = 15;
        dailySheet.getColumn(2).width = 20;
        dailySheet.getColumn(3).width = 15;
        dailySheet.getColumn(4).width = 15;
        dailySheet.getColumn(5).width = 15;
        dailySheet.getColumn(6).width = 20;
        dailySheet.getColumn(7).width = 15;
        dailySheet.getColumn(8).width = 15;
        dailySheet.getColumn(9).width = 15;
        dailySheet.getColumn(10).width = 20;
        dailySheet.getColumn(11).width = 15;
        dailySheet.getColumn(12).width = 20;

        const dailyTitleRow = dailySheet.addRow(['DETALLE DIARIO COMPLETO']);
        dailyTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
        dailyTitleRow.alignment = { horizontal: 'center' };
        dailySheet.mergeCells('A1:L1');

        const dailyHeaders = dailySheet.addRow([
          'Fecha',
          'Día de la Semana',
          'P1 - Dato 1',
          'P1 - Dato 2',
          'P1 - Total Día',
          'P1 - Acumulado',
          'P2 - Dato 1',
          'P2 - Dato 2',
          'P2 - Total Día',
          'P2 - Acumulado',
          'Porcentaje Día',
          'Total del Día'
        ]);

        dailyHeaders.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: 'FFFFFF' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' }
          };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          cell.alignment = { horizontal: 'center' };
        });

        const sortedDates = Object.keys(historicalData).sort();

        sortedDates.forEach((date, index) => {
          const data = historicalData[date];
          const dateObj = new Date(date + 'T00:00:00');
          const dayOfWeek = dateObj.toLocaleDateString('es-CO', { weekday: 'long' });
          
          let porcentajeDia = 0;
          const totalPaso1Dia = data.paso1.total || 0;
          const totalPaso2Dia = data.paso2.total || 0;
          
          if (totalPaso1Dia > 0 && totalPaso2Dia > 0) {
            const menor = Math.min(totalPaso1Dia, totalPaso2Dia);
            const mayor = Math.max(totalPaso1Dia, totalPaso2Dia);
            porcentajeDia = (menor / mayor) * 100;
          }
          
          const row = dailySheet.addRow([
            date,
            dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1),
            parseFloat(data.paso1.dato1 || 0),
            parseFloat(data.paso1.dato2 || 0),
            data.paso1.total || 0,
            data.paso1.acumulado || 0,
            parseFloat(data.paso2.dato1 || 0),
            parseFloat(data.paso2.dato2 || 0),
            data.paso2.total || 0,
            data.paso2.acumulado || 0,
            porcentajeDia / 100,
            (data.paso1.total || 0) + (data.paso2.total || 0)
          ]);

          if (index % 2 === 0) {
            row.eachCell((cell) => {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'E6F0FF' }
              };
            });
          }

          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });

          const porcentajeCell = row.getCell(11);
          porcentajeCell.numFmt = '0.00%';

          [3, 4, 5, 6, 7, 8, 9, 10, 12].forEach(colIndex => {
            const cell = row.getCell(colIndex);
            cell.numFmt = '#,##0';
          });
        });

        if (sortedDates.length > 0) {
          dailySheet.addRow([]);
          
          const totalsRow = dailySheet.addRow([
            'TOTALES',
            '',
            `=SUM(C3:C${sortedDates.length + 2})`,
            `=SUM(D3:D${sortedDates.length + 2})`,
            `=SUM(E3:E${sortedDates.length + 2})`,
            '',
            `=SUM(G3:G${sortedDates.length + 2})`,
            `=SUM(H3:H${sortedDates.length + 2})`,
            `=SUM(I3:I${sortedDates.length + 2})`,
            '',
            '',
            `=SUM(L3:L${sortedDates.length + 2})`
          ]);

          totalsRow.font = { bold: true };
          totalsRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF2CC' }
          };

          totalsRow.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
          });

          [3, 4, 5, 7, 8, 9, 12].forEach(colIndex => {
            const cell = totalsRow.getCell(colIndex);
            cell.numFmt = '#,##0';
          });
        }
      }

      if (type === 'full' || type === 'monthly') {
        if (Object.keys(monthlyData).length > 0) {
          const monthlySheet = workbook.addWorksheet('Resumen por Mes');

          monthlySheet.getColumn(1).width = 20;
          monthlySheet.getColumn(2).width = 15;
          monthlySheet.getColumn(3).width = 20;
          monthlySheet.getColumn(4).width = 20;
          monthlySheet.getColumn(5).width = 20;
          monthlySheet.getColumn(6).width = 15;

          const monthlyTitleRow = monthlySheet.addRow(['RESUMEN POR MES']);
          monthlyTitleRow.font = { bold: true, size: 14, color: { argb: '1F4E78' } };
          monthlyTitleRow.alignment = { horizontal: 'center' };
          monthlySheet.mergeCells('A1:F1');

          const monthlyHeaders = monthlySheet.addRow([
            'Mes',
            'Días',
            'Total Paso 1',
            'Total Paso 2',
            'Total General',
            'Porcentaje'
          ]);

          monthlyHeaders.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: '2E75B6' }
            };
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' }
            };
            cell.alignment = { horizontal: 'center' };
          });

          const months = Object.keys(monthlyData).sort();

          months.forEach((month, index) => {
            const data = monthlyData[month];
            const diasTotales = data.informacionConsolidada?.diasTotales || 0;
            const totalPaso1 = data.totalesPorDia?.paso1 || data.acumuladoGeneral?.paso1 || 0;
            const totalPaso2 = data.totalesPorDia?.paso2 || data.acumuladoGeneral?.paso2 || 0;
            const totalGeneral = data.totalesPorDia?.general || (totalPaso1 + totalPaso2);
            
            let porcentajeMes = data.porcentajeFinal || 0;
            if (porcentajeMes === 0 && totalPaso1 > 0 && totalPaso2 > 0) {
              const menor = Math.min(totalPaso1, totalPaso2);
              const mayor = Math.max(totalPaso1, totalPaso2);
              porcentajeMes = (menor / mayor) * 100;
            }

            const row = monthlySheet.addRow([
              month,
              diasTotales,
              totalPaso1,
              totalPaso2,
              totalGeneral,
              porcentajeMes / 100
            ]);

            if (index % 2 === 0) {
              row.eachCell((cell) => {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: 'F2F2F2' }
                };
              });
            }

            row.eachCell((cell) => {
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            });

            [3, 4, 5].forEach(colIndex => {
              const cell = row.getCell(colIndex);
              cell.numFmt = '#,##0';
            });

            const porcentajeCell = row.getCell(6);
            porcentajeCell.numFmt = '0.00%';
          });

          if (months.length > 0) {
            monthlySheet.addRow([]);
            
            const totalsRow = monthlySheet.addRow([
              'TOTALES',
              `=SUM(B3:B${months.length + 2})`,
              `=SUM(C3:C${months.length + 2})`,
              `=SUM(D3:D${months.length + 2})`,
              `=SUM(E3:E${months.length + 2})`,
              ''
            ]);

            totalsRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            totalsRow.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'C00000' }
            };

            totalsRow.eachCell((cell) => {
              cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
              };
            });

            [3, 4, 5].forEach(colIndex => {
              const cell = totalsRow.getCell(colIndex);
              cell.numFmt = '#,##0';
            });
          }
        } else if (type === 'monthly') {
          alert("No hay datos mensuales para exportar.");
          return;
        }
      }

      workbook.xlsx.writeBuffer().then(buffer => {
        const blob = new Blob([buffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        let fileName = '';
        let message = '';
        
        if (type === 'full') {
          fileName = `calculadora_diaria_completo_${currentDate}.xlsx`;
          message = `✅ Reporte completo exportado exitosamente.\n\nArchivo: ${fileName}`;
        } else if (type === 'today') {
          fileName = `calculadora_diaria_hoy_${currentDate}.xlsx`;
          message = `✅ Reporte del día actual exportado exitosamente.\n\nArchivo: ${fileName}`;
        } else if (type === 'daily') {
          fileName = `calculadora_diaria_detalle_${currentDate}.xlsx`;
          message = `✅ Detalle diario exportado exitosamente.\n\nArchivo: ${fileName}`;
        } else if (type === 'monthly') {
          fileName = `calculadora_diaria_mensual_${currentDate}.xlsx`;
          message = `✅ Resumen mensual exportado exitosamente.\n\nArchivo: ${fileName}`;
        }
        
        saveAs(blob, fileName);
        alert(message);
      });

    } catch (error) {
      console.error('Error al exportar a Excel:', error);
      alert('❌ Error al exportar los datos a Excel. Por favor, intenta nuevamente.');
    }
  };

  // ===================== FUNCIÓN PARA EXPORTAR MES ESPECÍFICO A EXCEL =====================
  const exportMonthToExcel = (monthKey) => {
    try {
      const monthData = monthlyData[monthKey];
      
      if (!monthData) {
        alert(`ℹ️ No hay datos consolidados para el mes ${monthKey}.`);
        return;
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Calculadora Diaria App';
      workbook.created = new Date();

      const summarySheet = workbook.addWorksheet('Resumen del Mes');
      
      summarySheet.getColumn(1).width = 25;
      summarySheet.getColumn(2).width = 25;

      const titleRow = summarySheet.addRow([`REPORTE DEL MES ${monthKey}`]);
      titleRow.font = { bold: true, size: 16, color: { argb: '1F4E78' } };
      titleRow.alignment = { horizontal: 'center' };
      summarySheet.mergeCells('A1:B1');

      summarySheet.addRow(['Mes:', monthKey]);
      summarySheet.addRow(['Días registrados:', monthData.informacionConsolidada?.diasTotales || 0]);
      summarySheet.addRow(['Primer día:', monthData.informacionConsolidada?.primerDia || 'N/A']);
      summarySheet.addRow(['Último día:', monthData.informacionConsolidada?.ultimoDia || 'N/A']);
      summarySheet.addRow(['Fecha de consolidación:', 
        monthData.fechaConsolidacion 
          ? new Date(monthData.fechaConsolidacion).toLocaleDateString('es-CO')
          : 'N/A'
      ]);
      summarySheet.addRow([]);

      const totalesHeader = summarySheet.addRow(['TOTALES POR DÍA', '']);
      totalesHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
      totalesHeader.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '2E75B6' }
      };
      summarySheet.mergeCells('A8:B8');

      const totalPaso1 = monthData.totalesPorDia?.paso1 || monthData.acumuladoGeneral?.paso1 || 0;
      const totalPaso2 = monthData.totalesPorDia?.paso2 || monthData.acumuladoGeneral?.paso2 || 0;
      const totalGeneral = monthData.totalesPorDia?.general || (totalPaso1 + totalPaso2);

      summarySheet.addRow(['Total Paso 1:', totalPaso1]);
      summarySheet.addRow(['Total Paso 2:', totalPaso2]);
      summarySheet.addRow(['Total General:', totalGeneral]);
      summarySheet.addRow([]);

      const acumuladosHeader = summarySheet.addRow(['ACUMULADOS FINALES', '']);
      acumuladosHeader.font = { bold: true, color: { argb: 'FFFFFF' } };
      acumuladosHeader.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '70AD47' }
      };
      summarySheet.mergeCells('A13:B13');

      const acumuladoPaso1 = monthData.acumuladoGeneral?.paso1 || totalPaso1;
      const acumuladoPaso2 = monthData.acumuladoGeneral?.paso2 || totalPaso2;
      const acumuladoTotal = monthData.acumuladoGeneral?.total || (acumuladoPaso1 + acumuladoPaso2);
      const porcentajeFinal = monthData.porcentajeFinal || 0;

      summarySheet.addRow(['Acumulado Paso 1:', acumuladoPaso1]);
      summarySheet.addRow(['Acumulado Paso 2:', acumuladoPaso2]);
      summarySheet.addRow(['Acumulado Total:', acumuladoTotal]);
      summarySheet.addRow(['Porcentaje final:', porcentajeFinal / 100]);

      [2, 3, 4, 5, 6, 9, 10, 11, 14, 15, 16].forEach(row => {
        const cell = summarySheet.getCell(`B${row}`);
        cell.numFmt = '#,##0';
      });

      const porcentajeCell = summarySheet.getCell('B17');
      porcentajeCell.numFmt = '0.00%';

      workbook.xlsx.writeBuffer().then(buffer => {
        const blob = new Blob([buffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        const fileName = `mes_${monthKey}_reporte.xlsx`;
        saveAs(blob, fileName);
        
        alert(`✅ Mes ${monthKey} exportado a Excel exitosamente.\n\nArchivo: ${fileName}`);
      });

    } catch (error) {
      console.error('Error al exportar mes a Excel:', error);
      alert('❌ Error al exportar el mes a Excel.');
    }
  };

  // ===================== DETECCIÓN DE CAMBIO DE MES =====================
  useEffect(() => {
    const checkMonthAndLastDay = () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const isLastDay = today.getDate() === lastDayOfMonth;
      setIsLastDayOfMonth(isLastDay);
      
      const newMonth = `${year}-${month.toString().padStart(2, '0')}`;
      
      if (newMonth !== currentMonth) {
        console.log(`🔄 ¡Cambió el mes! De ${currentMonth} a ${newMonth}`);
        
        setCurrentMonth(newMonth);
        
        setTodayData(prev => ({
          ...prev,
          date: currentDate,
          paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
          paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
          porcentaje: 0
        }));
        
        setIsDayCompleted(false);
        setCompletedSteps({ paso1: false, paso2: false });
        setCurrentView('paso1');
        
        alert(`📅 ¡Nuevo mes comenzado! (${newMonth})\n\nLos acumulados se han reiniciado a CERO.\nPuedes comenzar a registrar datos del nuevo mes.\n\n💡 El mes anterior (${currentMonth}) sigue disponible para exportar desde el historial.`);
      }
    };
    
    checkMonthAndLastDay();
    const interval = setInterval(checkMonthAndLastDay, 60000);
    
    return () => clearInterval(interval);
  }, [currentDate, currentMonth]);

  // ===================== FUNCIÓN MEJORADA: RESETEAR MES ACTUAL =====================
  const resetCurrentMonth = async () => {
    const confirmReset = window.confirm(
      `⚠️ ¿REINICIAR MES ${currentMonth}?\n\n` +
      `Esta acción eliminará SOLO los datos del mes ${currentMonth}:\n` +
      `• Todos los días registrados en ${currentMonth}\n` +
      `• Los acumulados actuales de ${currentMonth}\n\n` +
      '🚫 NO se eliminarán:\n' +
      '• Meses anteriores (quedan en historial)\n' +
      '• Resúmenes mensuales anteriores\n\n' +
      'Después del reinicio:\n' +
      `• Comenzarás ${currentMonth} desde CERO\n` +
      '• Podrás registrar nuevos datos normalmente\n' +
      '• Los meses anteriores seguirán disponibles\n\n' +
      '¿Continuar?'
    );

    if (!confirmReset) return;

    try {
      setLoading(true);
      setCloudStatus(`🔄 Reiniciando mes ${currentMonth}...`);

      if (user) {
        try {
          const monthDays = Object.keys(historicalData).filter(date => 
            date.startsWith(currentMonth)
          );
          
          console.log(`🗑️ Eliminando ${monthDays.length} días del mes ${currentMonth} de Firebase`);
          
          for (const date of monthDays) {
            await deleteFromFirebase('historicalData', date);
          }
          
          console.log(`✅ Datos del mes ${currentMonth} eliminados de Firebase`);
          
          if (monthlyData[currentMonth]) {
            await deleteFromFirebase('monthlyData', currentMonth);
            console.log(`✅ Resumen del mes ${currentMonth} eliminado de Firebase`);
          }
          
        } catch (firebaseError) {
          console.warn(`⚠️ No se pudieron eliminar datos del mes ${currentMonth}:`, firebaseError);
        }
      }

      const newHistoricalData = {};
      Object.entries(historicalData).forEach(([date, data]) => {
        if (!date.startsWith(currentMonth)) {
          newHistoricalData[date] = data;
        }
      });
      setHistoricalData(newHistoricalData);

      const newMonthlyData = {};
      Object.entries(monthlyData).forEach(([month, data]) => {
        if (month !== currentMonth) {
          newMonthlyData[month] = data;
        }
      });
      setMonthlyData(newMonthlyData);

      setTodayData({
        date: currentDate,
        paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
        paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0, totalDiaAnterior: 0 },
        porcentaje: 0
      });
      
      setIsDayCompleted(false);
      setCompletedSteps({ paso1: false, paso2: false });
      setCurrentView('paso1');
      
      setSelectedDate(null);
      setIsEditing(false);
      setEditData(null);

      setCloudStatus(`✅ Mes ${currentMonth} reiniciado - Listo para comenzar`);
      
      alert(`✅ Mes ${currentMonth} reiniciado exitosamente\n\n` +
            `Los datos de ${currentMonth} han sido eliminados.\n` +
            `Ahora puedes registrar nuevos datos desde HOY.\n\n` +
            `📊 Los meses anteriores siguen disponibles en:\n` +
            `• Historial de Meses\n` +
            `• Calendario\n` +
            `• Exportar Excel`);

      setLoading(false);

    } catch (error) {
      console.error(`❌ Error al reiniciar el mes ${currentMonth}:`, error);
      setCloudStatus(`❌ Error al reiniciar mes`);
      alert('❌ Hubo un error al intentar reiniciar el mes.\nPor favor, intenta nuevamente.');
      setLoading(false);
    }
  };

  // 🆕 Efecto para actualizar todayData cuando se carga historicalData
  useEffect(() => {
    if (!loading && historicalData[currentDate]) {
      console.log('🔄 Actualizando todayData con datos del día actual desde historicalData');
      const dayData = historicalData[currentDate];
      
      setTodayData({
        date: currentDate,
        paso1: {
          dato1: dayData.paso1?.dato1 || '',
          dato2: dayData.paso1?.dato2 || '',
          total: dayData.paso1?.total || 0,
          acumuladoAnterior: dayData.paso1?.acumuladoAnterior || 0,
          acumulado: dayData.paso1?.acumulado || 0,
          totalDiaAnterior: dayData.paso1?.totalDiaAnterior || 0
        },
        paso2: {
          dato1: dayData.paso2?.dato1 || '',
          dato2: dayData.paso2?.dato2 || '',
          total: dayData.paso2?.total || 0,
          acumuladoAnterior: dayData.paso2?.acumuladoAnterior || 0,
          acumulado: dayData.paso2?.acumulado || 0,
          totalDiaAnterior: dayData.paso2?.totalDiaAnterior || 0
        },
        porcentaje: dayData.porcentaje || 0
      });
      
      setIsDayCompleted(true);
      setCompletedSteps({ paso1: true, paso2: true });
      setCurrentView('resumen');
    }
  }, [historicalData, currentDate, loading]);

  // 🆕 Función para verificar si el día actual ya fue guardado
  const checkIfTodayIsCompleted = async () => {
    try {
      console.log('🔄 Verificando si el día actual está completado...', currentDate);
      
      if (historicalData && historicalData[currentDate]) {
        console.log('✅ Día actual encontrado en historicalData en memoria');
        const data = historicalData[currentDate];
        
        setTodayData({
          date: currentDate,
          paso1: {
            dato1: data.paso1?.dato1 || '',
            dato2: data.paso1?.dato2 || '',
            total: data.paso1?.total || 0,
            acumuladoAnterior: data.paso1?.acumuladoAnterior || 0,
            acumulado: data.paso1?.acumulado || 0,
            totalDiaAnterior: data.paso1?.totalDiaAnterior || 0
          },
          paso2: {
            dato1: data.paso2?.dato1 || '',
            dato2: data.paso2?.dato2 || '',
            total: data.paso2?.total || 0,
            acumuladoAnterior: data.paso2?.acumuladoAnterior || 0,
            acumulado: data.paso2?.acumulado || 0,
            totalDiaAnterior: data.paso2?.totalDiaAnterior || 0
          },
          porcentaje: data.porcentaje || 0
        });
        
        setIsDayCompleted(true);
        setCompletedSteps({ paso1: true, paso2: true });
        setCurrentView('resumen');
        
        return true;
      }

      if (user) {
        try {
          const docRef = doc(db, 'users', user.uid, 'historicalData', currentDate);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            console.log('✅ Día actual encontrado en Firebase');
            const data = docSnap.data();
            
            setHistoricalData(prev => ({
              ...prev,
              [currentDate]: data
            }));
            
            setTodayData({
              date: currentDate,
              paso1: {
                dato1: data.paso1?.dato1 || '',
                dato2: data.paso1?.dato2 || '',
                total: data.paso1?.total || 0,
                acumuladoAnterior: data.paso1?.acumuladoAnterior || 0,
                acumulado: data.paso1?.acumulado || 0,
                totalDiaAnterior: data.paso1?.totalDiaAnterior || 0
              },
              paso2: {
                dato1: data.paso2?.dato1 || '',
                dato2: data.paso2?.dato2 || '',
                total: data.paso2?.total || 0,
                acumuladoAnterior: data.paso2?.acumuladoAnterior || 0,
                acumulado: data.paso2?.acumulado || 0,
                totalDiaAnterior: data.paso2?.totalDiaAnterior || 0
              },
              porcentaje: data.porcentaje || 0
            });
            
            setIsDayCompleted(true);
            setCompletedSteps({ paso1: true, paso2: true });
            setCurrentView('resumen');
            
            return true;
          }
        } catch (firebaseError) {
          console.log('ℹ️ Error al conectar con Firebase para verificar día actual');
        }
      }

      console.log('ℹ️ Día actual NO encontrado - listo para registrar');
      setIsDayCompleted(false);
      
      loadPreviousDayData();
      
      return false;
    } catch (error) {
      console.error('Error verificando día actual:', error);
      setIsDayCompleted(false);
      
      loadPreviousDayData();
      
      return false;
    }
  };

  // Cargar datos iniciales CON FIREBASE
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        
        const FIXED_USER_ID = 'bEY1p1kgVjgk88AlCGa7nM6I1de2';
        
        try {
          const fixedUser = { uid: FIXED_USER_ID };
          setUser(fixedUser);
          setCloudStatus('✅ Conectado a la nube');
          
          await loadDataFromFirebase(FIXED_USER_ID);
          
        } catch (firebaseError) {
          console.log('Firebase no disponible, usando modo local');
          setCloudStatus('⚠️ Usando modo local');
        }
        
        setTimeout(async () => {
          await checkIfTodayIsCompleted();
          setLoading(false);
        }, 500);
        
      } catch (err) {
        setError('Error al cargar los datos');
        console.error('Error loading data:', err);
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, [currentDate]);

  // 🆕 Efecto para cargar día anterior después de verificar el día actual
  useEffect(() => {
    if (!loading && !isDayCompleted && Object.keys(historicalData).length >= 0) {
      if (Object.keys(historicalData).length > 0) {
        console.log('📊 Cargando acumulados desde datos históricos');
        loadPreviousDayData();
      }
    }
  }, [loading, isDayCompleted, historicalData]);

  // Función para cargar datos desde Firebase
  const loadDataFromFirebase = async (userId) => {
    try {
      const historicalRef = collection(db, 'users', userId, 'historicalData');
      const historicalSnapshot = await getDocs(historicalRef);
      
      const historical = {};
      historicalSnapshot.forEach(doc => {
        historical[doc.id] = doc.data();
      });
      
      const monthlyRef = collection(db, 'users', userId, 'monthlyData');
      const monthlySnapshot = await getDocs(monthlyRef);
      
      const monthly = {};
      monthlySnapshot.forEach(doc => {
        monthly[doc.id] = doc.data();
      });
      
      setHistoricalData(historical);
      setMonthlyData(monthly);
      
      console.log('✅ Datos cargados desde Firebase:', {
        diasHistoricos: Object.keys(historical).length,
        mesesConsolidados: Object.keys(monthly).length
      });
      
    } catch (error) {
      console.error('Error cargando de Firebase:', error);
      throw error;
    }
  };

  // Función para guardar en Firebase
  const saveToFirebase = async (collectionName, documentId, data) => {
    if (!user) return false;
    
    try {
      const docRef = doc(db, 'users', user.uid, collectionName, documentId);
      await setDoc(docRef, data, { merge: true });
      console.log(`✅ Guardado en Firebase: ${collectionName}/${documentId}`);
      return true;
    } catch (error) {
      console.error('Error guardando en Firebase:', error);
      return false;
    }
  };

  // Función para eliminar de Firebase
  const deleteFromFirebase = async (collectionName, documentId) => {
    if (!user) return false;
    
    try {
      const docRef = doc(db, 'users', user.uid, collectionName, documentId);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error eliminando de Firebase:', error);
      return false;
    }
  };

  // Guardar resumen del mes con JSON consolidado
  const saveMonthSummary = async (monthKey) => {
    try {
      const monthDays = Object.entries(historicalData).filter(([date]) => 
        date.startsWith(monthKey)
      );
      
      if (monthDays.length === 0) return;
      
      monthDays.sort((a, b) => a[0].localeCompare(b[0]));
      
      let totalDiarioPaso1 = 0;
      let totalDiarioPaso2 = 0;
      const diasRegistrados = [];
      
      const ultimoDia = monthDays[monthDays.length - 1];
      const acumuladoFinalPaso1 = ultimoDia[1]?.paso1?.acumulado || 0;
      const acumuladoFinalPaso2 = ultimoDia[1]?.paso2?.acumulado || 0;
      
      monthDays.forEach(([date, data]) => {
        totalDiarioPaso1 += data.paso1?.total || 0;
        totalDiarioPaso2 += data.paso2?.total || 0;
        
        diasRegistrados.push({
          fecha: date,
          paso1: {
            dato1: parseFloat(data.paso1?.dato1) || 0,
            dato2: parseFloat(data.paso1?.dato2) || 0,
            totalDia: data.paso1?.total || 0,
            acumuladoHastaDia: data.paso1?.acumulado || 0
          },
          paso2: {
            dato1: parseFloat(data.paso2?.dato1) || 0,
            dato2: parseFloat(data.paso2?.dato2) || 0,
            totalDia: data.paso2?.total || 0,
            acumuladoHastaDia: data.paso2?.acumulado || 0
          },
          porcentajeDia: data.porcentaje || 0
        });
      });
      
      const totalGeneralDiario = totalDiarioPaso1 + totalDiarioPaso2;
      const totalGeneralAcumulado = acumuladoFinalPaso1 + acumuladoFinalPaso2;
      const porcentajeFinal = acumuladoFinalPaso1 > 0 && acumuladoFinalPaso2 > 0 
        ? (Math.min(acumuladoFinalPaso1, acumuladoFinalPaso2) / Math.max(acumuladoFinalPaso1, acumuladoFinalPaso2)) * 100 
        : 0;
      
      const summary = {
        mes: monthKey,
        diasRegistrados: diasRegistrados,
        totalesPorDia: {
          paso1: totalDiarioPaso1,
          paso2: totalDiarioPaso2,
          general: totalGeneralDiario
        },
        acumuladoGeneral: {
          paso1: acumuladoFinalPaso1,
          paso2: acumuladoFinalPaso2,
          total: totalGeneralAcumulado
        },
        porcentajeFinal: parseFloat(porcentajeFinal.toFixed(2)),
        fechaConsolidacion: new Date().toISOString(),
        informacionConsolidada: {
          diasTotales: monthDays.length,
          primerDia: monthDays[0][0],
          ultimoDia: monthDays[monthDays.length - 1][0]
        }
      };
      
      if (user) {
        const firebaseSuccess = await saveToFirebase('monthlyData', monthKey, summary);
        if (firebaseSuccess) {
          setCloudStatus('💾 Mes consolidado en la nube');
        }
      }
      
      setMonthlyData(prev => ({
        ...prev,
        [monthKey]: summary
      }));
      
      alert(`📅 ¡Mes ${monthKey} consolidado!\nSe han registrado ${summary.informacionConsolidada.diasTotales} días.\n\n💡 Los datos diarios permanecen en Firebase para historial.\nPuedes exportar el resumen desde el historial de meses.`);
      
    } catch (error) {
      console.error('Error saving month summary:', error);
      alert('❌ Error al consolidar el mes. Intenta nuevamente.');
    }
  };

  // Función para obtener el día anterior
  const getPreviousDay = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  // 🆕 CORRECCIÓN: Cargar datos del día anterior - SOLO DEL MISMO MES
  const loadPreviousDayData = () => {
    try {
      console.log('🔄 Cargando datos del día anterior del mes actual...');
      
      const diasDelMes = Object.entries(historicalData)
        .filter(([date]) => date.startsWith(currentMonth) && date < currentDate)
        .sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
      
      console.log('Días disponibles del mes actual:', diasDelMes.map(([date]) => date));
      
      if (diasDelMes.length > 0) {
        const [fechaAnterior, datosAnterior] = diasDelMes[0];
        console.log('📅 Último día del mes con datos:', fechaAnterior);
        
        const totalDiaAnteriorPaso1 = datosAnterior.paso1?.total || 0;
        const totalDiaAnteriorPaso2 = datosAnterior.paso2?.total || 0;
        
        setTodayData(prev => ({
          ...prev,
          date: currentDate,
          paso1: {
            dato1: '',
            dato2: '',
            total: 0,
            acumuladoAnterior: datosAnterior.paso1?.acumulado || 0,
            acumulado: datosAnterior.paso1?.acumulado || 0,
            totalDiaAnterior: totalDiaAnteriorPaso1
          },
          paso2: {
            dato1: '',
            dato2: '',
            total: 0,
            acumuladoAnterior: datosAnterior.paso2?.acumulado || 0,
            acumulado: datosAnterior.paso2?.acumulado || 0,
            totalDiaAnterior: totalDiaAnteriorPaso2
          },
          porcentaje: 0
        }));
        
        console.log('✅ Acumulados cargados correctamente desde:', fechaAnterior, {
          totalDiaAnteriorPaso1,
          totalDiaAnteriorPaso2
        });
      } else {
        console.log('ℹ️ No hay días anteriores en el mes actual, comenzando desde cero');
        setTodayData(prev => ({
          ...prev,
          date: currentDate,
          paso1: { 
            dato1: '', 
            dato2: '', 
            total: 0, 
            acumuladoAnterior: 0, 
            acumulado: 0,
            totalDiaAnterior: 0 
          },
          paso2: { 
            dato1: '', 
            dato2: '', 
            total: 0, 
            acumuladoAnterior: 0, 
            acumulado: 0,
            totalDiaAnterior: 0 
          },
          porcentaje: 0
        }));
      }

    } catch (error) {
      console.error('Error cargando datos del día anterior:', error);
      setTodayData(prev => ({
        ...prev,
        date: currentDate,
        paso1: { 
          dato1: '', 
          dato2: '', 
          total: 0, 
          acumuladoAnterior: 0, 
          acumulado: 0,
          totalDiaAnterior: 0 
        },
        paso2: { 
          dato1: '', 
          dato2: '', 
          total: 0, 
          acumuladoAnterior: 0, 
          acumulado: 0,
          totalDiaAnterior: 0 
        },
        porcentaje: 0
      }));
    }
  };

  // 🆕 Función para corregir acumulados de días con errores
  const corregirAcumuladosErroneos = () => {
    const diasCorregidos = [];
    
    const diasDelMes = Object.entries(historicalData)
      .filter(([date]) => date.startsWith(currentMonth))
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
    
    if (diasDelMes.length <= 1) return diasCorregidos;
    
    let acumuladoCorrectoPaso1 = 0;
    let acumuladoCorrectoPaso2 = 0;
    
    for (let i = 0; i < diasDelMes.length; i++) {
      const [fecha, datos] = diasDelMes[i];
      
      const acumuladoAnteriorCorrectoPaso1 = i > 0 ? diasDelMes[i-1][1]?.paso1?.acumulado || 0 : 0;
      const acumuladoAnteriorCorrectoPaso2 = i > 0 ? diasDelMes[i-1][1]?.paso2?.acumulado || 0 : 0;
      
      const acumuladoCorrectoPaso1 = acumuladoAnteriorCorrectoPaso1 + (datos.paso1?.total || 0);
      const acumuladoCorrectoPaso2 = acumuladoAnteriorCorrectoPaso2 + (datos.paso2?.total || 0);
      
      if (datos.paso1?.acumuladoAnterior !== acumuladoAnteriorCorrectoPaso1 || 
          datos.paso1?.acumulado !== acumuladoCorrectoPaso1 ||
          datos.paso2?.acumuladoAnterior !== acumuladoAnteriorCorrectoPaso2 || 
          datos.paso2?.acumulado !== acumuladoCorrectoPaso2) {
        
        const datosCorregidos = {
          ...datos,
          paso1: {
            ...datos.paso1,
            acumuladoAnterior: acumuladoAnteriorCorrectoPaso1,
            acumulado: acumuladoCorrectoPaso1
          },
          paso2: {
            ...datos.paso2,
            acumuladoAnterior: acumuladoAnteriorCorrectoPaso2,
            acumulado: acumuladoCorrectoPaso2
          }
        };
        
        const totalPaso1 = datos.paso1?.total || 0;
        const totalPaso2 = datos.paso2?.total || 0;
        if (totalPaso1 > 0 && totalPaso2 > 0) {
          const menor = Math.min(totalPaso1, totalPaso2);
          const mayor = Math.max(totalPaso1, totalPaso2);
          datosCorregidos.porcentaje = (menor / mayor) * 100;
        }
        
        setHistoricalData(prev => ({
          ...prev,
          [fecha]: datosCorregidos
        }));
        
        if (user) {
          saveToFirebase('historicalData', fecha, datosCorregidos);
        }
        
        diasCorregidos.push(fecha);
        console.log(`✅ Día ${fecha} corregido`);
      }
    }
    
    if (diasCorregidos.length > 0) {
      console.log(`📊 Días corregidos: ${diasCorregidos.join(', ')}`);
    }
    
    return diasCorregidos;
  };

  // Ejecutar corrección cuando se cargan los datos
  useEffect(() => {
    if (!loading && Object.keys(historicalData).length > 0) {
      const diasCorregidos = corregirAcumuladosErroneos();
      if (diasCorregidos.length > 0 && diasCorregidos.includes(currentDate)) {
        const datosActualizados = historicalData[currentDate];
        if (datosActualizados) {
          setTodayData(datosActualizados);
        }
      }
    }
  }, [loading, historicalData, currentDate, user]);

  // Función para formatear números como moneda
  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  // Función para parsear moneda a número
  const parseCurrency = (value) => {
    return value.replace(/[^0-9]/g, '');
  };

  // Manejar cambios en los inputs
  const handleInputChange = (paso, field, value) => {
    const numValue = parseCurrency(value);

    setTodayData(prev => {
      const newData = { ...prev };
      if (!newData[paso]) newData[paso] = {};
      newData[paso][field] = numValue;

      const dato1 = parseFloat(newData[paso].dato1) || 0;
      const dato2 = parseFloat(newData[paso].dato2) || 0;

      newData[paso].total = dato1 + dato2;
      
      newData[paso].acumulado = newData[paso].acumuladoAnterior + newData[paso].total;

      return newData;
    });
  };

  // Continuar Paso 1
  const continuarPaso1 = () => {
    const { dato1, dato2 } = todayData.paso1;

    if (dato1 === '' || dato2 === '' || (parseFloat(dato1) === 0 && parseFloat(dato2) === 0)) {
      alert('⚠️ Debes ingresar al menos un valor diferente de cero en el Paso 1');
      return;
    }

    setCompletedSteps(prev => ({ ...prev, paso1: true }));
    setCurrentView('paso2');
  };

  // Continuar Paso 2
  const continuarPaso2 = () => {
    const { dato1, dato2 } = todayData.paso2;

    if (dato1 === '' || dato2 === '' || (parseFloat(dato1) === 0 && parseFloat(dato2) === 0)) {
      alert('⚠️ Debes ingresar al menos un valor diferente de cero en el Paso 2');
      return;
    }

    setCompletedSteps(prev => ({ ...prev, paso2: true }));
    setCurrentView('resumen');
  };

  // Manejar cambios en modo edición
  const handleEditInputChange = (paso, field, value) => {
    const numValue = parseCurrency(value);
    
    setEditData(prev => {
      if (!prev) return prev;
      
      const newData = { ...prev };
      if (!newData[paso]) newData[paso] = {};
      
      newData[paso][field] = numValue;
      
      const dato1 = parseFloat(newData[paso].dato1) || 0;
      const dato2 = parseFloat(newData[paso].dato2) || 0;
      newData[paso].total = dato1 + dato2;
      newData[paso].acumulado = (newData[paso].acumuladoAnterior || 0) + newData[paso].total;
      
      const totalPaso1 = newData.paso1?.total || 0;
      const totalPaso2 = newData.paso2?.total || 0;
      if (totalPaso1 > 0 && totalPaso2 > 0) {
        const menor = Math.min(totalPaso1, totalPaso2);
        const mayor = Math.max(totalPaso1, totalPaso2);
        newData.porcentaje = (menor / mayor) * 100;
      }
      
      return newData;
    });
  };

  // 🆕 Función para calcular porcentaje del día en tiempo real
  const calculateDayPercentage = () => {
    if (!todayData || !todayData.paso1 || !todayData.paso2) return 0;
    
    const totalPaso1 = parseFloat(todayData.paso1.dato1 || 0) + parseFloat(todayData.paso1.dato2 || 0);
    const totalPaso2 = parseFloat(todayData.paso2.dato1 || 0) + parseFloat(todayData.paso2.dato2 || 0);
    
    let porcentajeDia = 0;
    if (totalPaso1 > 0 && totalPaso2 > 0) {
      const menor = Math.min(totalPaso1, totalPaso2);
      const mayor = Math.max(totalPaso1, totalPaso2);
      porcentajeDia = (menor / mayor) * 100;
    }
    
    return porcentajeDia;
  };

  // 🆕 Calcular porcentaje del día en tiempo real cuando cambian los inputs
  useEffect(() => {
    if (!isDayCompleted && todayData && todayData.paso1 && todayData.paso2) {
      try {
        const porcentajeDia = calculateDayPercentage();
        setTodayData(prev => ({
          ...prev,
          porcentaje: porcentajeDia
        }));
      } catch (error) {
        console.error('Error calculando porcentaje en tiempo real:', error);
      }
    }
  }, [todayData?.paso1?.dato1, todayData?.paso1?.dato2, todayData?.paso2?.dato1, todayData?.paso2?.dato2, isDayCompleted]);

  // ===================== FUNCIÓN PARA SELECCIONAR FECHA EN CALENDARIO =====================
  const selectCalendarDate = (date) => {
    const data = historicalData[date];
    
    if (data) {
      viewHistoricalData(date);
    } else {
      if (window.confirm(`¿Quieres registrar datos para el día ${date}?`)) {
        setupDateForRegistration(date);
      }
    }
  };

  // ===================== CONFIGURAR FECHA PARA REGISTRO =====================
  const setupDateForRegistration = (date) => {
    const selectedMonth = date.slice(0, 7);
    
    const diasDelMes = Object.entries(historicalData)
      .filter(([d]) => d.startsWith(selectedMonth) && d < date)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
    
    let acumuladoAnteriorPaso1 = 0;
    let acumuladoAnteriorPaso2 = 0;
    
    if (diasDelMes.length > 0) {
      const ultimoDia = diasDelMes[0][1];
      acumuladoAnteriorPaso1 = ultimoDia.paso1?.acumulado || 0;
      acumuladoAnteriorPaso2 = ultimoDia.paso2?.acumulado || 0;
    }
    
    const newTodayData = {
      date: date,
      paso1: {
        dato1: '',
        dato2: '',
        total: 0,
        acumuladoAnterior: acumuladoAnteriorPaso1,
        acumulado: acumuladoAnteriorPaso1,
        totalDiaAnterior: 0
      },
      paso2: {
        dato1: '',
        dato2: '',
        total: 0,
        acumuladoAnterior: acumuladoAnteriorPaso2,
        acumulado: acumuladoAnteriorPaso2,
        totalDiaAnterior: 0
      },
      porcentaje: 0
    };
    
    setTodayData(newTodayData);
    setIsDayCompleted(false);
    setCompletedSteps({ paso1: false, paso2: false });
    setCurrentView('paso1');
    setSelectedDate(date);
    setShowCalendar(false);
    
    alert(`✅ Listo para registrar datos del ${date}\n\n📊 Acumulados cargados desde día anterior del mismo mes.`);
  };

  // ===================== GUARDAR DATOS DEL DÍA (SOPORTA DÍAS PASADOS) =====================
  const saveData = async () => {
    try {
      const saveDate = selectedDate || currentDate;
      console.log('💾 Guardando datos para el día:', saveDate);
      
      if (new Date(saveDate) > new Date()) {
        alert('❌ No puedes registrar datos para días futuros.');
        return;
      }
      
      const diasDelMes = Object.entries(historicalData)
        .filter(([date]) => date.startsWith(saveDate.slice(0, 7)) && date < saveDate)
        .sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
      
      let acumuladoAnteriorPaso1 = 0;
      let acumuladoAnteriorPaso2 = 0;
      
      if (diasDelMes.length > 0) {
        const ultimoDia = diasDelMes[0][1];
        acumuladoAnteriorPaso1 = ultimoDia.paso1?.acumulado || 0;
        acumuladoAnteriorPaso2 = ultimoDia.paso2?.acumulado || 0;
        
        console.log('📊 Acumulado anterior encontrado del día:', diasDelMes[0][0], {
          paso1: acumuladoAnteriorPaso1,
          paso2: acumuladoAnteriorPaso2
        });
      } else {
        console.log('ℹ️ No hay días anteriores en el mes actual, comenzando desde cero');
      }
      
      const totalDiaPaso1 = parseFloat(todayData.paso1.dato1 || 0) + parseFloat(todayData.paso1.dato2 || 0);
      const totalDiaPaso2 = parseFloat(todayData.paso2.dato1 || 0) + parseFloat(todayData.paso2.dato2 || 0);
      
      const nuevoAcumuladoPaso1 = acumuladoAnteriorPaso1 + totalDiaPaso1;
      const nuevoAcumuladoPaso2 = acumuladoAnteriorPaso2 + totalDiaPaso2;
      
      let porcentajeDia = 0;
      try {
        porcentajeDia = calculateDayPercentage();
      } catch (error) {
        console.error('Error calculando porcentaje:', error);
        porcentajeDia = 0;
      }
      
      const datosDia = {
        date: saveDate,
        paso1: {
          dato1: todayData.paso1.dato1 || '',
          dato2: todayData.paso1.dato2 || '',
          total: totalDiaPaso1,
          acumuladoAnterior: acumuladoAnteriorPaso1,
          acumulado: nuevoAcumuladoPaso1,
          totalDiaAnterior: todayData.paso1.totalDiaAnterior || 0
        },
        paso2: {
          dato1: todayData.paso2.dato1 || '',
          dato2: todayData.paso2.dato2 || '',
          total: totalDiaPaso2,
          acumuladoAnterior: acumuladoAnteriorPaso2,
          acumulado: nuevoAcumuladoPaso2,
          totalDiaAnterior: todayData.paso2.totalDiaAnterior || 0
        },
        porcentaje: porcentajeDia
      };
      
      console.log('💾 Guardando datos CORREGIDOS para fecha:', saveDate, datosDia);
      
      const nuevosHistoricalData = {
        ...historicalData,
        [saveDate]: datosDia
      };
      
      if (saveDate !== currentDate) {
        const mesActual = saveDate.slice(0, 7);
        const diasDelMes = Object.entries(nuevosHistoricalData)
          .filter(([date]) => date.startsWith(mesActual))
          .sort((a, b) => a[0].localeCompare(b[0]));
        
        for (let i = 0; i < diasDelMes.length; i++) {
          const fecha = diasDelMes[i][0];
          const datos = { ...diasDelMes[i][1] };
          
          if (i === 0) {
            datos.paso1.acumuladoAnterior = 0;
            datos.paso1.acumulado = datos.paso1.total;
            datos.paso2.acumuladoAnterior = 0;
            datos.paso2.acumulado = datos.paso2.total;
          } else {
            const datosAnterior = nuevosHistoricalData[diasDelMes[i-1][0]];
            datos.paso1.acumuladoAnterior = datosAnterior.paso1?.acumulado || 0;
            datos.paso1.acumulado = (datosAnterior.paso1?.acumulado || 0) + datos.paso1.total;
            datos.paso2.acumuladoAnterior = datosAnterior.paso2?.acumulado || 0;
            datos.paso2.acumulado = (datosAnterior.paso2?.acumulado || 0) + datos.paso2.total;
          }
          
          if (datos.paso1.total > 0 && datos.paso2.total > 0) {
            const menor = Math.min(datos.paso1.total, datos.paso2.total);
            const mayor = Math.max(datos.paso1.total, datos.paso2.total);
            datos.porcentaje = (menor / mayor) * 100;
          }
          
          nuevosHistoricalData[fecha] = datos;
        }
      }
      
      setHistoricalData(nuevosHistoricalData);
      setTodayData(datosDia);
      
      if (user) {
        const mesActual = saveDate.slice(0, 7);
        const diasDelMes = Object.entries(nuevosHistoricalData)
          .filter(([date]) => date.startsWith(mesActual));
        
        for (const [fecha, datos] of diasDelMes) {
          await saveToFirebase('historicalData', fecha, datos);
        }
        
        setCloudStatus('💾 Datos sincronizados en la nube');
      }
      
      setIsDayCompleted(true);
      setCompletedSteps({ paso1: true, paso2: true });
      setCurrentView('resumen');
      setSelectedDate(null);

      alert(`✅ Día ${saveDate} guardado exitosamente.\n\n📊 Los acumulados del mes han sido actualizados correctamente.`);
      
    } catch (error) {
      console.error('Error al guardar datos:', error);
      alert('❌ Error al guardar los datos. Intenta nuevamente.');
    }
  };

  // Iniciar edición
  const startEditing = (date) => {
    const dataToEdit = historicalData[date];
    setEditData({ ...dataToEdit });
    setIsEditing(true);
  };

  // Guardar cambios de edición
  const saveEdit = async () => {
    try {
      const newHistoricalData = {
        ...historicalData,
        [editData.date]: { ...editData }
      };
      
      setHistoricalData(newHistoricalData);
      
      if (user) {
        await saveToFirebase('historicalData', editData.date, editData);
        setCloudStatus('💾 Cambios guardados en la nube');
      }
      
      if (editData.date === currentDate) {
        setTodayData(editData);
      }
      
      setSelectedDate(null);
      setIsEditing(false);
      setEditData(null);

      alert('✅ Cambios guardados exitosamente.');
    } catch (error) {
      console.error('Error saving edit:', error);
      alert('❌ Error al guardar los cambios. Intenta nuevamente.');
    }
  };

  // Cancelar edición
  const cancelEdit = () => {
    setIsEditing(false);
    setEditData(null);
  };

  // Ver datos históricos
  const viewHistoricalData = (date) => {
    setSelectedDate(date);
    setShowCalendar(false);
  };

  // Generar días del mes para el calendario
  const generateCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateString = date.toISOString().split('T')[0];
      const hasData = historicalData.hasOwnProperty(dateString);
      const isToday = dateString === currentDate;
      
      days.push({
        day,
        date: dateString,
        hasData,
        isToday
      });
    }
    
    return days;
  };

  // Cambiar mes del calendario
  const changeMonth = (increment) => {
    setCalendarMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + increment);
      return newDate;
    });
  };

  // ===================== RENDERIZAR CALENDARIO CORREGIDO =====================
  const renderCalendar = () => {
    const days = generateCalendarDays();
    const monthName = calendarMonth.toLocaleDateString('es-CO', { 
      month: 'long', 
      year: 'numeric' 
    });
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Historial</h2>
          <button
            onClick={() => setShowCalendar(false)}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft size={24} />
          </button>
          <h3 className="text-xl font-semibold capitalize">{monthName}</h3>
          <button
            onClick={() => changeMonth(1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center font-semibold text-gray-600 text-sm">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((dayInfo, index) => {
            if (!dayInfo) {
              return <div key={`empty-${index}`} className="aspect-square"></div>;
            }

            const { day, date, hasData, isToday } = dayInfo;
            
            const isFutureDate = new Date(date) > new Date(currentDate);
            const isSelectable = !isFutureDate;

            return (
              <button
                key={date}
                onClick={() => isSelectable ? selectCalendarDate(date) : null}
                disabled={!isSelectable}
                className={`
                  aspect-square p-2 rounded-lg font-semibold transition-all relative
                  ${hasData 
                    ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer' 
                    : isSelectable 
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer'
                      : 'bg-gray-50 text-gray-400 cursor-not-allowed'
                  }
                  ${isToday ? 'ring-2 ring-green-500' : ''}
                `}
                title={isFutureDate ? "Fecha futura - No editable" : hasData ? "Ver datos" : "Registrar día"}
              >
                {day}
                {hasData && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-white rounded-full"></div>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-sm text-gray-600 space-y-1">
          <p>• <span className="text-blue-500 font-semibold">Azul</span>: Días con datos guardados</p>
          <p>• <span className="text-gray-700 font-semibold">Gris claro</span>: Días disponibles para registrar</p>
          <p>• <span className="text-gray-400 font-semibold">Gris oscuro</span>: Días futuros (solo lectura)</p>
          <p>• <span className="text-green-500 font-semibold">Borde verde</span>: Día actual</p>
          <p className="mt-2 font-semibold">💡 Haz click en cualquier día pasado para ver o registrar datos</p>
        </div>
      </div>
    );
  };

  // Renderizar historial mensual
  const renderMonthlyHistory = () => {
    const months = Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0]));
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">📊 Historial de Meses</h2>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowMonthlyHistory(false)}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ✕
            </button>
          </div>
        </div>
        
        {months.length === 0 ? (
  <p className="text-gray-500 text-center py-8">No hay meses completados aún</p>
) : (
  <div className="space-y-6">
    {months
      .filter(([monthKey]) => {
        // Solo mostrar meses completados (que están en monthlyData)
        // y no mostrar el mes actual si no está completado
        const isCurrentMonth = monthKey === currentMonth;
        const hasMonthData = monthlyData[monthKey];
        return hasMonthData && !(isCurrentMonth && !isDayCompleted);
      })
      .map(([monthKey, data]) => {
        if (!data) return null;
        
        const diasTotales = data.informacionConsolidada?.diasTotales || 0;
        const totalPaso1 = data.totalesPorDia?.paso1 || data.acumuladoGeneral?.paso1 || 0;
        const totalPaso2 = data.totalesPorDia?.paso2 || data.acumuladoGeneral?.paso2 || 0;
        const totalGeneral = data.totalesPorDia?.general || (totalPaso1 + totalPaso2);
        const porcentaje = data.porcentajeFinal || 0;

        return (
          <div key={monthKey} className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
            <div className="flex justify-between items-center mb-3">
              <div className="flex space-x-2">
                <button
                  onClick={() => exportMonthToExcel(monthKey)}
                  className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-200 transition-colors"
                >
                  Exportar mes
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
              <div>
                <p className="text-gray-600">Días registrados:</p>
                <p className="font-bold text-lg">{diasTotales}</p>
              </div>
              <div>
                <p className="text-gray-600">Total Paso 1:</p>
                <p className="font-bold text-blue-900">{formatCurrency(totalPaso1)}</p>
              </div>
              <div>
                <p className="text-gray-600">Total Paso 2:</p>
                <p className="font-bold text-green-900">{formatCurrency(totalPaso2)}</p>
              </div>
              <div>
                <p className="text-gray-600">Total General:</p>
                <p className="font-bold text-purple-900 text-lg">{formatCurrency(totalGeneral)}</p>
              </div>
            </div>
            
            <div className="border-t pt-3 mt-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Acumulado Paso 1:</p>
                  <p className="font-bold text-blue-900">{formatCurrency(data.acumuladoGeneral?.paso1 || totalPaso1)}</p>
                </div>
                <div>
                  <p className="text-gray-600">Acumulado Paso 2:</p>
                  <p className="font-bold text-green-900">{formatCurrency(data.acumuladoGeneral?.paso2 || totalPaso2)}</p>
                </div>
              </div>
              <div className="mt-3 text-center">
                <p className="text-gray-600">Porcentaje final:</p>
                <p className="font-bold text-2xl text-purple-900">{porcentaje.toFixed(2)}%</p>
              </div>
            </div>
          </div>
        );
      })}
  </div>
)}
        
        <div className="mt-6 space-y-4">
          <div className="bg-gradient-to-r from-green-50 to-teal-50 border-l-4 border-green-500 p-4 rounded-lg">
            <h4 className="font-bold text-green-900 mb-3 text-lg">📤 Exportar Reportes</h4>
            
            <div className="space-y-2">
              <button
                onClick={() => exportToExcel('full')}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={20} />
                <span>EXPORTAR REPORTE COMPLETO</span>
              </button>
              
              <button
                onClick={() => exportToExcel('daily')}
                className="w-full bg-blue-500 text-white py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={20} />
                <span>EXPORTAR DETALLE DIARIO</span>
              </button>
              
              <button
                onClick={exportAllDataToJSON}
                className="w-full bg-gray-700 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={20} />
                <span>EXPORTAR BACKUP (JSON)</span>
              </button>
            </div>
          </div>
          
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <h4 className="font-bold text-red-900 mb-2">⚠️ Reiniciar mes actual</h4>
            <p className="text-sm text-red-700 mb-2">
              <strong>Esta acción eliminará SOLO los datos del mes actual ({currentMonth}):</strong>
            </p>
            <ul className="text-sm text-red-700 list-disc pl-5 mb-3">
              <li>Días registrados en {currentMonth}</li>
              <li>Acumulados de {currentMonth}</li>
            </ul>
            <p className="text-sm text-red-700 mb-3">
              <strong>NO se eliminarán:</strong>
              <br/>
              • Meses anteriores (quedan en historial)
              <br/>
              • Resúmenes mensuales anteriores
            </p>
            <button
              onClick={resetCurrentMonth}
              className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
            >
              <Trash2 size={20} />
              <span>REINICIAR MES ACTUAL ({currentMonth})</span>
            </button>
            <p className="text-xs text-red-600 mt-2 text-center">
              ⚠️ Esta acción NO se puede deshacer para el mes actual
            </p>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-bold text-blue-900 mb-2">📤 Importar Datos</h4>
            <div className="flex space-x-4">
              <label className="relative group flex-1 bg-blue-500 text-white py-2 rounded-lg font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2 cursor-pointer">
                <span>📥 Importar desde JSON</span>
                <input
                  type="file"
                  accept=".json,.txt"
                  onChange={importData}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-xs text-gray-600 mt-2 text-center">
              💡 Solo archivos JSON exportados desde esta aplicación
            </p>
          </div>
          
          <div className="text-sm text-gray-500">
            <p>📈 <strong>Estadísticas actuales:</strong></p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Meses completados: {Object.keys(monthlyData).length}</li>
              <li>Días registrados totales: {Object.keys(historicalData).length}</li>
              <li>Último mes: {currentMonth}</li>
            </ul>
            <p className="mt-3">☁️ {cloudStatus}</p>
          </div>
        </div>
      </div>
    );
  };

  // Renderizar vista histórica
const renderHistoricalView = () => {
  // ✅ CORRECCIÓN: Si el día NO tiene datos, mostramos formulario para registrar
  if (!selectedDate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Error</h2>
              <button
                onClick={() => {
                  setSelectedDate(null);
                  setIsEditing(false);
                  setEditData(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>
            <p className="text-gray-600 text-center py-8">
              No se ha seleccionado una fecha.
            </p>
            <button
              onClick={() => {
                setSelectedDate(null);
                setIsEditing(false);
                setEditData(null);
              }}
              className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ✅ CORRECCIÓN: Verificar si estamos en modo registro de día nuevo
  const isNewDay = !historicalData[selectedDate] && !editData;
  
  if (isNewDay) {
    // MODO REGISTRO: Mostrar formulario para registrar día nuevo
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                Registrar datos para el {selectedDate}
              </h2>
              <button
                onClick={() => {
                  setSelectedDate(null);
                  setIsEditing(false);
                  setEditData(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>
            
            <div className="mb-6 bg-blue-50 p-4 rounded-lg">
              <p className="text-blue-800">
                <span className="font-bold">📝 Estás registrando datos para:</span> {selectedDate}
              </p>
              <p className="text-sm text-blue-600 mt-1">
                Esta fecha no tiene datos registrados. Completa los campos para guardar.
              </p>
            </div>

            <div className="space-y-6">
              {/* Paso 1 - Datos básicos */}
              <div className="border rounded-lg p-4 bg-blue-50">
                <h3 className="font-bold text-lg mb-3 text-blue-900">Paso 1</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 1</label>
                    <input
                      type="text"
                      value={formatCurrency(todayData.paso1?.dato1 || '')}
                      onChange={(e) => handleInputChange('paso1', 'dato1', e.target.value)}
                      className="w-full p-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none"
                      placeholder="$0"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 2</label>
                    <input
                      type="text"
                      value={formatCurrency(todayData.paso1?.dato2 || '')}
                      onChange={(e) => handleInputChange('paso1', 'dato2', e.target.value)}
                      className="w-full p-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none"
                      placeholder="$0"
                    />
                  </div>
                </div>
              </div>

              {/* Paso 2 - Datos básicos */}
              <div className="border rounded-lg p-4 bg-green-50">
                <h3 className="font-bold text-lg mb-3 text-green-900">Paso 2</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 1</label>
                    <input
                      type="text"
                      value={formatCurrency(todayData.paso2?.dato1 || '')}
                      onChange={(e) => handleInputChange('paso2', 'dato1', e.target.value)}
                      className="w-full p-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                      placeholder="$0"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 2</label>
                    <input
                      type="text"
                      value={formatCurrency(todayData.paso2?.dato2 || '')}
                      onChange={(e) => handleInputChange('paso2', 'dato2', e.target.value)}
                      className="w-full p-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                      placeholder="$0"
                    />
                  </div>
                </div>
              </div>

              {/* Resumen en tiempo real */}
              <div className="border rounded-lg p-4 bg-purple-50">
                <h3 className="font-bold text-lg mb-3 text-purple-900">Resumen del Día</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-3 rounded-lg">
                    <p className="text-sm text-gray-600">Total Paso 1:</p>
                    <p className="font-bold text-lg text-blue-900">
                      {formatCurrency(todayData.paso1?.total || 0)}
                    </p>
                  </div>
                  <div className="bg-white p-3 rounded-lg">
                    <p className="text-sm text-gray-600">Total Paso 2:</p>
                    <p className="font-bold text-lg text-green-900">
                      {formatCurrency(todayData.paso2?.total || 0)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-purple-200">
                  <p className="text-sm text-gray-600">Total del día:</p>
                  <p className="font-bold text-2xl text-purple-900">
                    {formatCurrency((todayData.paso1?.total || 0) + (todayData.paso2?.total || 0))}
                  </p>
                </div>
              </div>

              {/* Botones de acción */}
              <div className="space-y-3">
                <button
                  onClick={saveData}
                  className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <Save size={20} />
                  <span>Guardar Datos</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedDate(null);
                    setIsEditing(false);
                    setEditData(null);
                    setShowCalendar(true);
                  }}
                  className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
                >
                  Cancelar y volver al calendario
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MODO LECTURA/EDICIÓN: Mostrar datos existentes
  const data = editData || historicalData[selectedDate];
  
  // ✅ CORRECCIÓN: Función segura para calcular porcentaje del mes
  const calculateMonthAccumulated = () => {
    const monthKey = selectedDate.slice(0, 7);
    const monthDays = Object.entries(historicalData)
      .filter(([date]) => date.startsWith(monthKey) && date <= selectedDate)
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    if (monthDays.length === 0) return { paso1: 0, paso2: 0, total: 0, porcentaje: 0 };
    
    const lastDay = monthDays[monthDays.length - 1][1];
    const acum1 = lastDay.paso1?.acumulado || 0;
    const acum2 = lastDay.paso2?.acumulado || 0;
    const total = acum1 + acum2;
    
    let porcentaje = 0;
    if (acum1 > 0 && acum2 > 0) {
      const menor = Math.min(acum1, acum2);
      const mayor = Math.max(acum1, acum2);
      porcentaje = (menor / mayor) * 100;
    }
    
    return { paso1: acum1, paso2: acum2, total, porcentaje };
  };
  
  // ✅ CORRECCIÓN: Función segura para calcular porcentaje del día
  const calculateDayPercentage = () => {
    if (!data || !data.paso1 || !data.paso2) return 0;
    
    const totalPaso1 = data.paso1.total || 0;
    const totalPaso2 = data.paso2.total || 0;
    
    let porcentajeDia = 0;
    if (totalPaso1 > 0 && totalPaso2 > 0) {
      const menor = Math.min(totalPaso1, totalPaso2);
      const mayor = Math.max(totalPaso1, totalPaso2);
      porcentajeDia = (menor / mayor) * 100;
    }
    
    return porcentajeDia;
  };
  
  const monthAccumulated = calculateMonthAccumulated();
  const dayPercentage = calculateDayPercentage();
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </h2>
        <button
          onClick={() => {
            setSelectedDate(null);
            setIsEditing(false);
            setEditData(null);
          }}
          className="text-gray-500 hover:text-gray-700 text-2xl"
        >
          ✕
        </button>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 bg-amber-50 border-amber-200">
            <h3 className="font-bold text-lg mb-3 text-amber-900">Porcentaje del DÍA</h3>
            <div className="space-y-2 text-amber-600">
              <p className="font-bold text-3xl text-center text-amber-700">
                {dayPercentage.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
            <h3 className="font-bold text-lg mb-3 text-purple-900">Porcentaje del MES</h3>
            <div className="space-y-2 text-purple-900">
              <p className="font-bold text-3xl text-center text-purple-700">
                {monthAccumulated.porcentaje.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg p-4 bg-blue-50">
            <h3 className="font-bold text-lg mb-3 text-blue-900">Paso 1</h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso1?.dato1 || '')}
                    onChange={(e) => handleEditInputChange('paso1', 'dato1', e.target.value)}
                    className="w-full p-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso1?.dato2 || '')}
                    onChange={(e) => handleEditInputChange('paso1', 'dato2', e.target.value)}
                    className="w-full p-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="pt-2 border-t border-blue-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Acum. anterior:</p>
                      <p className="font-bold text-blue-900">{formatCurrency(data.paso1?.acumuladoAnterior || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total del día:</p>
                      <p className="font-bold text-blue-900">{formatCurrency(data.paso1?.total || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="pt-2 border-t border-blue-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Total del día:</p>
                      <p className="font-bold text-blue-900">{formatCurrency(data.paso1?.total || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border rounded-lg p-4 bg-green-50">
            <h3 className="font-bold text-lg mb-3 text-green-900">Paso 2</h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso2?.dato1 || '')}
                    onChange={(e) => handleEditInputChange('paso2', 'dato1', e.target.value)}
                    className="w-full p-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso2?.dato2 || '')}
                    onChange={(e) => handleEditInputChange('paso2', 'dato2', e.target.value)}
                    className="w-full p-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div className="pt-2 border-t border-green-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Acum. anterior:</p>
                      <p className="font-bold text-green-900">{formatCurrency(data.paso2?.acumuladoAnterior || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total del día:</p>
                      <p className="font-bold text-green-900">{formatCurrency(data.paso2?.total || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="pt-2 border-t border-green-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Total del día:</p>
                      <p className="font-bold text-green-900">{formatCurrency(data.paso2?.total || 0)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="font-bold text-lg mb-3 text-gray-900">Resumen Comparativo</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">Paso 1 - Total del día:</p>
              <p className="font-bold text-lg text-blue-900">{formatCurrency(data.paso1?.total || 0)}</p>
              <p className="text-sm text-gray-600 mt-2">Paso 1 - Acum. del mes:</p>
              <p className="font-bold text-xl text-blue-900">{formatCurrency(data.paso1?.acumulado || 0)}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">Paso 2 - Total del día:</p>
              <p className="font-bold text-lg text-green-900">{formatCurrency(data.paso2?.total || 0)}</p>
              <p className="text-sm text-gray-600 mt-2">Paso 2 - Acum. del mes:</p>
              <p className="font-bold text-xl text-green-900">{formatCurrency(data.paso2?.acumulado || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {isEditing ? (
          <div className="flex space-x-3">
            <button
              onClick={saveEdit}
              className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
            >
              <Check size={20} />
              <span>Guardar Cambios</span>
            </button>
            <button
              onClick={cancelEdit}
              className="flex-1 bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2"
            >
              <X size={20} />
              <span>Cancelar</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => startEditing(selectedDate)}
              className="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center space-x-2"
            >
              <Edit2 size={20} />
              <span>Editar Datos</span>
            </button>
            <button
              onClick={() => {
                setSelectedDate(null);
                setEditData(null);
                setShowCalendar(true);
              }}
              className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
            >
              Volver al Calendario
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos...</p>
          <p className="text-sm text-gray-500 mt-2">Verificando si hoy ya fue registrado</p>
        </div>
      </div>
    );
  }

  if (showMonthlyHistory) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderMonthlyHistory()}
        </div>
      </div>
    );
  }

  if (showCalendar) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderCalendar()}
        </div>
      </div>
    );
  }

  if (selectedDate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderHistoricalView()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800">Calculadora Diaria</h1>
              <p className="text-gray-600">
                {new Date(currentDate + 'T00:00:00').toLocaleDateString('es-CO', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {isDayCompleted && (
                  <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm inline-flex items-center">
                    ✅ Día completado - Datos guardados
                  </span>
                )}
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                  📅 Mes: {currentMonth}
                </span>
                {isLastDayOfMonth && (
                  <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                    ⚠️ ¡ÚLTIMO DÍA DEL MES!
                  </span>
                )}
                {selectedDate && selectedDate !== currentDate && (
                  <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                    📝 Registrando día pasado: {selectedDate}
                  </span>
                )}
              </div>
              <div className="mt-2 flex space-x-2">
                <span className={`text-sm px-3 py-1 rounded-full flex items-center ${
                  cloudStatus.includes('✅') ? 'bg-green-100 text-green-700' :
                  cloudStatus.includes('💾') ? 'bg-blue-100 text-blue-700' :
                  cloudStatus.includes('⚠️') ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  <Cloud size={12} className="mr-1" />
                  {cloudStatus}
                </span>
                <button
                  onClick={() => exportToExcel('full')}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full hover:bg-green-200 transition-colors flex items-center space-x-1"
                >
                  <Download size={12} />
                  <span>Exportar a Excel</span>
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowCalendar(true)}
              className="bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 transition-colors"
              title="Ver historial diario"
            >
              <Calendar size={24} />
            </button>
            <button
              onClick={() => setShowMonthlyHistory(true)}
              className="bg-purple-500 text-white p-3 rounded-lg hover:bg-purple-600 transition-colors ml-2"
              title="Ver historial de meses"
            >
              📊
            </button>
          </div>
        </div>

        {isLastDayOfMonth && !isDayCompleted && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-yellow-500 text-2xl">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-bold text-yellow-800">¡ÚLTIMO DÍA DEL MES!</h3>
                <div className="mt-1 text-yellow-700">
                  <p className="font-semibold">📝 Puedes registrar datos normalmente hoy.</p>
                  <ul className="mt-1 text-sm list-disc list-inside space-y-1">
                    <li>Los acumulados se reiniciarán a CERO</li>
                    <li>Podrás exportar el resumen del mes desde el historial</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentView('paso1')}
              disabled={!isDayCompleted && (currentView === 'paso2' || currentView === 'paso1')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'paso1'
                  ? 'bg-blue-500 text-white'
                  : completedSteps.paso2 || isDayCompleted
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Paso 1
            </button>
            <button
              onClick={() => setCurrentView('paso2')}
              disabled={!isDayCompleted && (currentView === 'paso2' || !completedSteps.paso1)}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'paso2'
                  ? 'bg-green-500 text-white'
                  : completedSteps.paso2 || isDayCompleted
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Paso 2
            </button>
            <button
              onClick={() => setCurrentView('resumen')}
              disabled={!completedSteps.paso2 && !isDayCompleted}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'resumen'
                  ? 'bg-purple-500 text-white'
                  : completedSteps.paso2 || isDayCompleted
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Resumen
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          {currentView === 'paso1' && (
            <div>
              <h2 className="text-2xl font-bold text-blue-900 mb-6">Paso 1</h2>
              
              {isDayCompleted && (
                <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-4">
                  <p className="text-blue-800 font-semibold">
                    ℹ️ Este día ya fue registrado. Los datos están en modo solo lectura.
                  </p>
                  <p className="text-sm text-blue-700 mt-1">
                    Podrás registrar nuevos datos mañana o editar este día desde el historial.
                  </p>
                </div>
              )}
              
              {todayData.paso1.totalDiaAnterior > 0 && !isDayCompleted && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    📊 <strong>Total del día anterior: {formatCurrency(todayData.paso1.totalDiaAnterior)}</strong>
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                {isDayCompleted ? (
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <p className="text-gray-700 font-semibold mb-1">Dato 1:</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatCurrency(historicalData[currentDate]?.paso1?.dato1 || todayData.paso1.dato1 || '0')}
                      </p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg border border-blue-200">
                      <p className="text-gray-700 font-semibold mb-1">Dato 2:</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {formatCurrency(historicalData[currentDate]?.paso1?.dato2 || todayData.paso1.dato2 || '0')}
                      </p>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-lg space-y-1">
                      <p className="text-gray-700 font-semibold">Acumulado anterior: {formatCurrency(historicalData[currentDate]?.paso1?.acumuladoAnterior || todayData.paso1.acumuladoAnterior || 0)}</p>
                      <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(historicalData[currentDate]?.paso1?.total || todayData.paso1.total || 0)}</p>
                      <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                        Acumulado del mes: {formatCurrency(historicalData[currentDate]?.paso1?.acumulado || todayData.paso1.acumulado || 0)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                      <input
                        type="text"
                        value={formatCurrency(todayData.paso1.dato1)}
                        onChange={(e) => handleInputChange('paso1', 'dato1', e.target.value)}
                        disabled={completedSteps.paso1}
                        className={`w-full p-3 border-2 rounded-lg text-lg ${
                          completedSteps.paso1
                            ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                            : 'border-blue-300 focus:border-blue-500 focus:outline-none'
                        }`}
                        placeholder="$0"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Dato 2</label>
                      <input
                        type="text"
                        value={formatCurrency(todayData.paso1.dato2)}
                        onChange={(e) => handleInputChange('paso1', 'dato2', e.target.value)}
                        disabled={completedSteps.paso1}
                        className={`w-full p-3 border-2 rounded-lg text-lg ${
                          completedSteps.paso1
                            ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                            : 'border-blue-300 focus:border-blue-500 focus:outline-none'
                        }`}
                        placeholder="$0"
                      />
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg space-y-1">
                      <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso1.total)}</p>
                      <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                        Acumulado del mes: {formatCurrency(todayData.paso1.acumulado)}
                      </p>
                    </div>
                  </>
                )}

                {!completedSteps.paso1 && !isDayCompleted && (
                  <button
                    onClick={continuarPaso1}
                    disabled={todayData.paso1.dato1 === '' || todayData.paso1.dato2 === ''}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                      todayData.paso1.dato1 === '' || todayData.paso1.dato2 === ''
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    <span>Siguiente: Paso 2</span>
                    <ChevronRight size={20} />
                  </button>
                )}
                
                {(completedSteps.paso1 || isDayCompleted) && (
                  <div className="bg-blue-100 p-3 rounded-lg text-center text-blue-800 font-semibold">
                    ✓ Paso completado - Solo lectura
                  </div>
                )}
              </div>
            </div>
          )}

          {currentView === 'paso2' && (
            <div>
              <h2 className="text-2xl font-bold text-green-900 mb-6">Paso 2</h2>

              {isDayCompleted && (
                <div className="bg-green-100 border-l-4 border-green-500 p-4 mb-4">
                  <p className="text-green-800 font-semibold">
                    ℹ️ Este día ya fue registrado. Los datos están en modo solo lectura.
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Podrás registrar nuevos datos mañana o editar este día desde el historial.
                  </p>
                </div>
              )}

              {todayData.paso2.totalDiaAnterior > 0 && !isDayCompleted && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    📊 <strong>Total del día anterior: {formatCurrency(todayData.paso2.totalDiaAnterior)}</strong>
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {isDayCompleted ? (
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded-lg border border-green-200">
                      <p className="text-gray-700 font-semibold mb-1">Dato 1:</p>
                      <p className="text-2xl font-bold text-green-900">
                        {formatCurrency(historicalData[currentDate]?.paso2?.dato1 || todayData.paso2.dato1 || '0')}
                      </p>
                    </div>
                    
                    <div className="bg-white p-4 rounded-lg border border-green-200">
                      <p className="text-gray-700 font-semibold mb-1">Dato 2:</p>
                      <p className="text-2xl font-bold text-green-900">
                        {formatCurrency(historicalData[currentDate]?.paso2?.dato2 || todayData.paso2.dato2 || '0')}
                      </p>
                    </div>
                    
                    <div className="bg-green-50 p-4 rounded-lg space-y-1">
                      <p className="text-gray-700 font-semibold">Acumulado anterior: {formatCurrency(historicalData[currentDate]?.paso2?.acumuladoAnterior || todayData.paso2.acumuladoAnterior || 0)}</p>
                      <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(historicalData[currentDate]?.paso2?.total || todayData.paso2.total || 0)}</p>
                      <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                        Acumulado del mes: {formatCurrency(historicalData[currentDate]?.paso2?.acumulado || todayData.paso2.acumulado || 0)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                      <input
                        type="text"
                        value={formatCurrency(todayData.paso2.dato1)}
                        onChange={(e) => handleInputChange('paso2', 'dato1', e.target.value)}
                        disabled={completedSteps.paso2}
                        className={`w-full p-3 border-2 rounded-lg text-lg ${
                          completedSteps.paso2
                            ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                            : 'border-green-300 focus:border-green-500 focus:outline-none'
                        }`}
                        placeholder="$0"
                      />
                    </div>

                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">Dato 2</label>
                      <input
                        type="text"
                        value={formatCurrency(todayData.paso2.dato2)}
                        onChange={(e) => handleInputChange('paso2', 'dato2', e.target.value)}
                        disabled={completedSteps.paso2}
                        className={`w-full p-3 border-2 rounded-lg text-lg ${
                          completedSteps.paso2
                            ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                            : 'border-green-300 focus:border-green-500 focus:outline-none'
                        }`}
                        placeholder="$0"
                      />
                    </div>

                    <div className="bg-green-50 p-4 rounded-lg space-y-1">
                      <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso2.total)}</p>
                      <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                        Acumulado del mes: {formatCurrency(todayData.paso2.acumulado)}
                      </p>
                    </div>
                  </>
                )}

                {!completedSteps.paso2 && !isDayCompleted && (
                  <button
                    onClick={continuarPaso2}
                    disabled={todayData.paso2.dato1 === '' || todayData.paso2.dato2 === ''}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                      todayData.paso2.dato1 === '' || todayData.paso2.dato2 === ''
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-green-500 text-white hover:bg-green-600'
                    }`}
                  >
                    <span>Ver Resumen</span>
                    <ChevronRight size={20} />
                  </button>
                )}
                
                {(completedSteps.paso2 || isDayCompleted) && (
                  <div className="bg-green-100 p-3 rounded-lg text-center text-green-800 font-semibold">
                    ✓ Paso completado - Solo lectura
                  </div>
                )}
              </div>
            </div>
          )}
          {currentView === 'resumen' && (
            <div>
              <h2 className="text-2xl font-bold text-purple-900 mb-6">Resumen del Día</h2>
              
              {isDayCompleted && (
                <div className="bg-purple-100 border-l-4 border-purple-500 p-4 mb-4">
                  <p className="text-purple-800 font-semibold">
                    ✅ Este día ya fue guardado exitosamente.
                  </p>
                  <p className="text-sm text-purple-700 mt-1">
                    Los datos están sincronizados con la nube. Podrás registrar el siguiente día mañana.
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-bold text-blue-900 mb-3 text-lg">Paso 1</h3>
                  <p className="text-gray-700">
                    Total del día: <span className="font-bold">
                      {formatCurrency(
                        isDayCompleted && historicalData[currentDate] 
                          ? historicalData[currentDate].paso1?.total 
                          : todayData.paso1?.total || 0
                      )}
                    </span>
                  </p>
                  <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                    Acumulado del mes: {formatCurrency(
                      isDayCompleted && historicalData[currentDate] 
                        ? historicalData[currentDate].paso1?.acumulado 
                        : todayData.paso1?.acumulado || 0
                    )}
                  </p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-bold text-green-900 mb-3 text-lg">Paso 2</h3>
                  <p className="text-gray-700">
                    Total del día: <span className="font-bold">
                      {formatCurrency(
                        isDayCompleted && historicalData[currentDate] 
                          ? historicalData[currentDate].paso2?.total 
                          : todayData.paso2?.total || 0
                      )}
                    </span>
                  </p>
                  <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                    Acumulado del mes: {formatCurrency(
                      isDayCompleted && historicalData[currentDate] 
                        ? historicalData[currentDate].paso2?.acumulado 
                        : todayData.paso2?.acumulado || 0
                    )}
                  </p>
                </div>

                <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
                  <h3 className="font-bold text-purple-900 text-lg mb-3">Total del Día</h3>
                  <p className="font-bold text-3xl text-purple-900">
                    {formatCurrency(
                      (isDayCompleted && historicalData[currentDate] 
                        ? (historicalData[currentDate].paso1?.total || 0) + (historicalData[currentDate].paso2?.total || 0)
                        : (todayData.paso1?.total || 0) + (todayData.paso2?.total || 0)
                      )
                    )}
                  </p>
                  <div className="border-t-2 border-purple-300 pt-3 mt-3">
                    <p className="font-bold text-purple-900 text-2xl">
                      Porcentaje del día: {(
                        isDayCompleted && historicalData[currentDate] 
                          ? historicalData[currentDate].porcentaje 
                          : calculateDayPercentage()
                      ).toFixed(2)}%
                    </p>
                  </div>
                </div>

                {!isDayCompleted && (
                  <button
                    onClick={saveData}
                    className="w-full bg-purple-500 text-white py-3 rounded-lg font-semibold hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2"
                  >
                    <Save size={20} />
                    <span>Guardar Datos del Día</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-sm text-gray-500">
          <p>💡 Cada nuevo mes los acumulados comienzan desde CERO. Los meses anteriores permanecen en Firebase para historial.</p>
          <p className="mt-1">☁️ {cloudStatus}</p>
        </div>
      </div>
    </div>
  );
};

export default App;